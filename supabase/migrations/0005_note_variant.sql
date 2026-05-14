-- memo · sticky note variants
-- Each note picks a visual treatment at creation time. The composer
-- offers a "tone" toggle (note / quote). Picking "note" rolls a random
-- variant from {classic, strip, grain, tape}; picking "quote" pins
-- variant = 'quote'. Variant is immutable after insert.
--
-- Null = legacy rows pre-migration; client falls back to 'classic'.

alter table notes add column if not exists variant text;

alter table notes
  drop constraint if exists notes_variant_check;
alter table notes
  add constraint notes_variant_check
  check (
    variant is null
    or variant in ('classic', 'strip', 'grain', 'tape', 'quote')
  );
