import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    try {
        const item = await prisma.menu.findUnique({
            where: { id: 48 }
        });
        console.log('Menu Item 48:', item);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
