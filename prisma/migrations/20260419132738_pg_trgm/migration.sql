CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX customers_search_gin ON customers
  USING GIN (("firstName" || ' ' || "lastName" || ' ' || COALESCE(phone,'') || ' ' || COALESCE(email,'')) gin_trgm_ops);
