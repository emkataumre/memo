-- memo · resizable sticky notes
-- Width + min-height in canvas-space pixels. Null = use the client's
-- default (208 × 128 currently). The client clamps within
-- [208, 480] × [128, 480] before sending; the column type is plain int
-- so a misbehaving client can't poison a row, just constrained range.

alter table notes add column if not exists width int;
alter table notes add column if not exists height int;
