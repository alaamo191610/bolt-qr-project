-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "has_modifiers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggested_items_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
