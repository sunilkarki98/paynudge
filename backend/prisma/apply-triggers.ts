import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('Applying Supabase auth triggers...')

  // Create the trigger function
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO public."User" (id, email, "createdAt", "updatedAt")
      VALUES (new.id, new.email, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        "updatedAt" = now();
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `)

  // Drop existing trigger if it exists to avoid errors
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  `)

  // Create the trigger on auth.users
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  `)

  // Create update function
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.handle_user_update()
    RETURNS trigger AS $$
    BEGIN
      UPDATE public."User"
      SET email = new.email, "updatedAt" = now()
      WHERE id = new.id;
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `)

  // Drop existing update trigger
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
  `)

  // Create the update trigger
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER on_auth_user_updated
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_user_update();
  `)

  console.log('Triggers applied successfully.')
}

main()
  .catch((e) => {
    console.error('Error applying triggers:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
