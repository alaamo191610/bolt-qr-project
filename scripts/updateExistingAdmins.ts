import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateExistingAdmins() {
    try {
        // Update all existing admins to have STANDARD plan with default limits
        const result = await prisma.admin.updateMany({
            where: {
                subscription_plan: {
                    not: 'STANDARD', // Only update if not already set
                },
            },
            data: {
                subscription_plan: 'STANDARD',
                subscription_status: 'ACTIVE',
                max_tables: 10,
                max_menu_items: 50,
                max_staff_accounts: 1,
                // Optional: Add 30 days grace period
                subscription_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        console.log(`✅ Updated ${result.count} existing admin(s) to STANDARD plan`);
        console.log('📅 All admins have 30 days grace period');
    } catch (error) {
        console.error('❌ Error updating admins:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateExistingAdmins();
