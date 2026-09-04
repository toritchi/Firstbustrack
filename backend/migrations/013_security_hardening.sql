-- Phase 14: production hardening constraints and refund provider traceability.
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_nonnegative CHECK (amount_dzd >= 0);

ALTER TABLE refund_requests
  ADD CONSTRAINT refund_approved_amount_valid CHECK (
    approved_amount_dzd IS NULL OR (approved_amount_dzd > 0 AND approved_amount_dzd <= requested_amount_dzd)
  );

ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS provider_reference text;
CREATE INDEX IF NOT EXISTS payments_provider_reference_idx ON payments(provider, provider_reference);
CREATE INDEX IF NOT EXISTS refund_requests_provider_reference_idx ON refund_requests(provider_reference);
