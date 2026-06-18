import { PrismaClient, UserRole, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const masterTenant = await prisma.tenant.upsert({
    where: { slug: 'master' },
    update: {},
    create: {
      nome_empresa: 'Dripfy Master',
      slug: 'master',
      status_assinatura: SubscriptionStatus.ativo,
    },
  });

  const passwordHash = await bcrypt.hash('Admin@123!', 12);

  await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: masterTenant.id, email: 'dripfy.tec@gmail.com' } },
    update: {},
    create: {
      tenant_id: masterTenant.id,
      nome: 'Admin Master',
      email: 'dripfy.tec@gmail.com',
      password_hash: passwordHash,
      role: UserRole.admin_master,
    },
  });

  console.log('Seed concluído. Admin Master: dripfy.tec@gmail.com / Admin@123!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
