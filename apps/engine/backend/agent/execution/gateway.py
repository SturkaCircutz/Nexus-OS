"""The trusted execution gateway: the sole authority path to a tool.

Doc 01: "The Python policy/gateway is the sole authority path to a tool. It
either invokes a Python engine tool or issues a typed modules/ipc request to
a Rust Tauri command. It binds approval to the exact proposal fingerprint,
records a receipt, and returns an ExecutionReceipt (C7)."

Invariants enforced here:
- an ExecutionRequest (C6) is only honored when its fingerprint matches the
  stored proposal and, when the tool has side effects, a still-valid approval
  bound to that exact fingerprint;
- idempotency: an external side effect is never repeated for the same
  idempotency key. An earlier receipt is returned verbatim; when an
  execution started but evidence is missing, the gateway replies
  ``unknown_outcome`` instead of re-running (doc 03 section 7);
- every run ends in a persisted receipt plus audit events.
"""

from __future__ import annotations

import asyncio
import json
import secrets
from typing import Any, Optional
from uuid import uuid4

from agent.execution.adapters import UnknownOutcomeError
from agent.execution.desktop_bridge import DesktopBridgeUnavailable
from schemas.contracts import (
    ApprovalStatus,
    CoreError,
    ErrorCode,
    ExecutionReceipt,
    ExecutionRequest,
    ReceiptStatus,
    RiskClass,
    utc_now_iso,
)

_RISK_ORDER: dict[RiskClass, int] = {
    RiskClass.read_only: 0,
    RiskClass.reversible_write: 1,
    RiskClass.sensitive: 2,
    RiskClass.destructive: 3,
}


def core_error(code: ErrorCode, message: str, retryable: bool = False) -> CoreError:
    return CoreError(code=code, message=message, retryable=retryable)


class UnknownOutcome(Exception):
    """Raised internally when an adapter result cannot be proven."""


class GatewayConfig:
    default_timeout_ms: int = 10_000


class ExecutionGateway:
    """Validate -> authorize -> execute -> observe -> receipt."""

    def __init__(
        self,
        registry: Any,
        policy: Any,
        repos: Any,
        settings: Any,
        adapters: Optional[dict[str, Any]] = None,
        desktop_bridge: Optional[Any] = None,
    ) -> None:
        self._registry = registry
        self._policy = policy
        self._repos = repos
        self._settings = settings
        self._desktop_bridge = desktop_bridge
        self._approver: Any = None
        if adapters is None:
            from agent.execution.adapters import ADAPTERS

            adapters = ADAPTERS
        self._adapters: dict[str, Any] = adapters

    def set_approval_service(self, approver: Any) -> None:
        """Wire the shared ApprovalService (engine owns one instance)."""
        self._approver = approver

    # ------------------------------------------------------------------
    # Public entry
    # ------------------------------------------------------------------

    async def execute(
        self,
        execution: ExecutionRequest,
        ctx: Any,
        approved_session_id: Optional[str] = None,
    ) -> ExecutionReceipt:
        """Execute an authorized request exactly once per idempotency key."""
        started_at = utc_now_iso()

        tool_id = self._tool_id_for_execution(execution)
        if tool_id is None:
            return self._rejected_receipt(
                execution.execution_id,
                started_at,
                core_error(ErrorCode.POLICY_DENIED, "proposal for execution was not found"),
            )

        try:
            entry = self._registry.get(tool_id)
        except KeyError:
            return self._rejected_receipt(
                execution.execution_id,
                started_at,
                core_error(ErrorCode.TOOL_UNAVAILABLE, f"tool {tool_id} is not registered"),
            )

        if not self._verify_fingerprint(execution, entry, approved_session_id):
            return self._rejected_receipt(
                execution.execution_id,
                started_at,
                core_error(
                    ErrorCode.POLICY_DENIED,
                    "execution does not match its proposal fingerprint or a valid approval",
                ),
            )

        # Idempotency: query prior evidence before ever re-invoking (doc 03).
        prior = self._prior_evidence(execution)
        if prior is not None:
            return prior

        self._repos.executions.start(execution, tool_id, fingerprint_verified=True)
        self._audit("execution_started", execution,
                    {"proposal_id": execution.proposal_id, "tool_id": tool_id,
                     "idempotency_key": execution.idempotency_key})
        started_at = utc_now_iso()

        try:
            if entry.native:
                return await self._execute_native(execution, entry, started_at)
            return await self._execute_python(execution, entry, started_at, ctx)
        except UnknownOutcome as outcome:
            return self._finish_unknown(execution, started_at, outcome.args[0])
        except asyncio.TimeoutError:
            timeout_ms = entry.timeout_ms or self._timeout()
            # The side effect may or may not have started: never guess.
            return self._finish_unknown(
                execution, started_at, f"no receipt within {timeout_ms}ms"
            )
        except UnknownOutcomeError as error:
            return self._finish_unknown(execution, started_at, str(error))
        except Exception as error:  # adapter failure stays a typed receipt
            return self._finish(
                execution,
                ReceiptStatus.failed,
                started_at,
                error=core_error(ErrorCode.ADAPTER_FAILURE, f"adapter failed: {error}"),
            )

    # ------------------------------------------------------------------
    # Authorization helpers
    # ------------------------------------------------------------------

    def _tool_id_for_execution(self, execution: ExecutionRequest) -> Optional[str]:
        row = self._repos.proposals.get(execution.proposal_id)
        if row is None:
            return None
        return row["tool_id"]

    def _proposal_payload(self, proposal_id: str) -> Optional[dict[str, Any]]:
        row = self._repos.proposals.get(proposal_id)
        if row is None:
            return None
        return json.loads(row["payload"])

    def _verify_fingerprint(
        self, execution: ExecutionRequest, entry: Any, approved_session_id: Optional[str]
    ) -> bool:
        payload = self._proposal_payload(execution.proposal_id)
        if payload is None:
            return False
        if payload["tool_version"] != entry.version:
            return False
        if payload["proposal_fingerprint"] != execution.proposal_fingerprint:
            return False
        if not payload.get("side_effect") and _RISK_ORDER[entry.risk] == _RISK_ORDER[RiskClass.read_only]:
            return True  # read-only, no side effect: no approval binding required

        # Side-effecting path: a valid, unexpired approval bound to the exact
        # fingerprint must exist (doc 02: approval is bound and checked).
        approval_row = None
        if execution.approval_id is not None:
            approval_row = self._repos.approvals.get(execution.approval_id)
            if approval_row is not None and approval_row["session_id"] != approved_session_id:
                return False
        else:
            approval_row = self._approver.approved_for(
                execution.proposal_fingerprint, approved_session_id or ""
            )
        if approval_row is None:
            return False
        if approval_row["status"] != ApprovalStatus.approved.value:
            return False
        if approval_row["expires_at"] <= utc_now_iso():
            return False
        if approval_row["proposal_fingerprint"] != execution.proposal_fingerprint:
            return False
        return True

    def _prior_evidence(self, execution: ExecutionRequest) -> Optional[ExecutionReceipt]:
        prior = self._repos.executions.find_by_idempotency_key(execution.idempotency_key)
        if prior is None:
            return None
        receipt_status = prior.get("receipt_status")
        payload = prior.get("receipt_payload")
        if receipt_status is not None and payload:
            try:
                return ExecutionReceipt.model_validate(json.loads(payload))
            except Exception:
                pass  # fall through to unknown below
        # Started but no readable receipt: do not re-run the side effect.
        return ExecutionReceipt(
            execution_id=prior["execution_id"],
            status=ReceiptStatus.unknown_outcome,
            started_at=utc_now_iso(),
            error=core_error(
                ErrorCode.UNKNOWN_OUTCOME,
                "prior execution has no readable outcome; reconcile before retrying",
            ),
        )

    # ------------------------------------------------------------------
    # Adapter execution
    # ------------------------------------------------------------------

    async def _execute_python(
        self, execution: ExecutionRequest, entry: Any, started_at: str, ctx: Any
    ) -> ExecutionReceipt:
        payload = self._proposal_payload(execution.proposal_id) or {}
        args = payload.get("args", {})
        self._registry.validate_args(payload["tool_id"], args)  # re-validate at the gate
        adapter_fn = self._adapters.get(entry.adapter_id)
        if adapter_fn is None:
            return self._finish(
                execution, ReceiptStatus.failed, started_at,
                error=core_error(ErrorCode.TOOL_UNAVAILABLE,
                                 f"adapter {entry.adapter_id} is not available"),
            )
        output = await asyncio.wait_for(
            adapter_fn(args, ctx), timeout=(entry.timeout_ms or self._timeout()) / 1000
        )
        # The observed adapter payload is stored verbatim under "output"; the
        # receipt's output_ref points at this audit row (C7 exteriorization).
        return self._finish(
            execution, ReceiptStatus.succeeded, started_at,
            output=output, adapter_id=entry.adapter_id,
        )

    async def _execute_native(
        self, execution: ExecutionRequest, entry: Any, started_at: str
    ) -> ExecutionReceipt:
        if self._desktop_bridge is None:
            return self._finish(
                execution, ReceiptStatus.failed, started_at,
                error=core_error(ErrorCode.TOOL_UNAVAILABLE, "no desktop bridge configured"),
            )
        payload = self._proposal_payload(execution.proposal_id) or {}
        args = payload.get("args", {})
        try:
            observation = await asyncio.wait_for(
                self._desktop_bridge.invoke_native_command(entry.native_command_id, args),
                timeout=(entry.timeout_ms or self._timeout()) / 1000,
            )
        except asyncio.TimeoutError:
            return self._finish_unknown(execution, started_at, "native command produced no receipt")
        except DesktopBridgeUnavailable as error:
            # Provable: the side effect did not start. Failed, retryable=maybe.
            return self._finish(
                execution, ReceiptStatus.failed, started_at,
                error=core_error(ErrorCode.TOOL_UNAVAILABLE, str(error)),
            )
        observation_payload = getattr(observation, "payload", {})
        return self._finish(
            execution, ReceiptStatus.succeeded, started_at,
            output={"native_command_id": entry.native_command_id,
                    "observation": observation_payload},
        )

    # ------------------------------------------------------------------
    # Receipt assembly / persistence
    # ------------------------------------------------------------------

    def _timeout(self) -> int:
        return GatewayConfig.default_timeout_ms

    def _finish(
        self,
        execution: ExecutionRequest,
        status: ReceiptStatus,
        started_at: str,
        output: Optional[dict[str, Any]] = None,
        error: Optional[CoreError] = None,
        adapter_id: Optional[str] = None,
    ) -> ExecutionReceipt:
        event_id = self._audit(
            "execution_observed", execution,
            {"output": output, "adapter": adapter_id},
        )
        receipt = ExecutionReceipt(
            execution_id=execution.execution_id,
            status=status,
            started_at=started_at,
            finished_at=utc_now_iso(),
            output_ref=f"audit:{event_id}" if output is not None else None,
            error=error,
            adapter_observation_ref=f"audit:{event_id}" if output is not None else None,
        )
        self._repos.executions.record_receipt(receipt)
        self._audit(
            "receipt_recorded", execution,
            {"receipt_status": receipt.status.value,
             "error_code": receipt.error.code.value if receipt.error else None},
        )
        return receipt

    def _finish_unknown(
        self, execution: ExecutionRequest, started_at: str, detail: str
    ) -> ExecutionReceipt:
        return self._finish(
            execution, ReceiptStatus.unknown_outcome, started_at,
            error=core_error(
                ErrorCode.UNKNOWN_OUTCOME, detail, retryable=True
            ),
        )

    def _rejected_receipt(
        self, execution_id: str, started_at: str, error: CoreError
    ) -> ExecutionReceipt:
        return ExecutionReceipt(
            execution_id=execution_id,
            status=ReceiptStatus.failed,
            started_at=started_at,
            finished_at=utc_now_iso(),
            error=error,
        )

    def _audit(self, event_type: str, execution: ExecutionRequest, detail: dict[str, Any]) -> str:
        """Audit rows carry the owning request/task when they can be resolved
        from the proposal, so a request's activity is reconstructible (doc 04
        rule 12: audit events link everything back to the request)."""
        request_id: Optional[str] = None
        task_id: Optional[str] = None
        proposal_row = self._repos.proposals.get(execution.proposal_id)
        if proposal_row is not None:
            request_id = proposal_row.get("request_id")
            task_id = proposal_row.get("task_id")
        return self._repos.audit.append(
            event_type,
            request_id,
            task_id,
            {"execution_id": execution.execution_id, **detail},
        )
