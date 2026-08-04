-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "till_shift_id" UUID;

-- CreateIndex
CREATE INDEX "payments_till_shift_id_status_created_at_idx" ON "payments"("till_shift_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_till_shift_id_fkey" FOREIGN KEY ("till_shift_id") REFERENCES "till_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
