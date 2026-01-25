import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSuperAdmin() {
    const email = 'admin@yourrestaurant.com'; // Change this to your email
    const password = 'SuperAdmin123!'; // Change this to a secure password
    const name = 'Super Administrator';

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if super admin already exists
        const existing = await prisma.superAdmin.findUnique({
            where: { email },
        });

        if (existing) {
            console.log('❌ Super admin already exists with this email');
            return;
        }

        // Create super admin
        const superAdmin = await prisma.superAdmin.create({
            data: {
                email,
                password: hashedPassword,
                name,
            },
        });

        console.log('✅ Super admin created successfully!');
        console.log('📧 Email:', email);
        console.log('🔑 Password:', password);
        console.log('⚠️  Please change this password after first login!');
        console.log('\nSuper Admin ID:', superAdmin.id);
    } catch (error) {
        console.error('❌ Error creating super admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createSuperAdmin();
