-- AlterTable
ALTER TABLE "menu_ingredients" ADD COLUMN     "extra_available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extra_price_override" DECIMAL(10,2),
ADD COLUMN     "max_extra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "removable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "type" TEXT DEFAULT 'dine_in';

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" SERIAL NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "selection_type" TEXT DEFAULT 'single',
    "min_select" INTEGER DEFAULT 0,
    "max_select" INTEGER DEFAULT 1,
    "required" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_qty" INTEGER DEFAULT 1,
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_groups" (
    "menu_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,

    CONSTRAINT "menu_modifier_groups_pkey" PRIMARY KEY ("menu_id","group_id")
);

-- CreateTable
CREATE TABLE "combo_groups" (
    "id" SERIAL NOT NULL,
    "menu_id" INTEGER NOT NULL,
    "min_select" INTEGER DEFAULT 1,
    "max_select" INTEGER DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_group_items" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "child_menu_id" INTEGER NOT NULL,
    "upgrade_price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN DEFAULT false,

    CONSTRAINT "combo_group_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_group_items" ADD CONSTRAINT "combo_group_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "combo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_group_items" ADD CONSTRAINT "combo_group_items_child_menu_id_fkey" FOREIGN KEY ("child_menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
