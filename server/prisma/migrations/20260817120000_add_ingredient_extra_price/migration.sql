-- Store the default price for an ingredient extra. Menu-specific overrides
-- remain available through menu_ingredients.extra_price_override.
ALTER TABLE "ingredients"
ADD COLUMN "extra_price" DECIMAL(10,2) NOT NULL DEFAULT 0;
