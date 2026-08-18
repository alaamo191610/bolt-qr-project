CREATE TYPE "OrderPaymentMethod" AS ENUM ('CASH', 'CARD_MACHINE');

ALTER TABLE "orders"
ADD COLUMN "payment_method" "OrderPaymentMethod";
