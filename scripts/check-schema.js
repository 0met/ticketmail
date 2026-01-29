const { sql, closePool } = require('../netlify/functions/lib/database-local');

const ENV_SOURCE = process.env.DATABASE_URL
    ? 'DATABASE_URL'
    : process.env.SUPABASE_DB_URL
        ? 'SUPABASE_DB_URL'
        : 'default local connection';

(async () => {
    console.log('Inspecting Postgres schema via', ENV_SOURCE);

    const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('companies', 'users', 'tickets')
    `;

    const users = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position
    `;

    const tickets = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets'
        ORDER BY ordinal_position
    `;

    const indexes = await sql`
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'tickets', 'companies')
    `;

    console.log('Companies table exists:', tables.some(t => t.table_name === 'companies'));
    console.log('Users columns:', users.map(u => `${u.column_name} (${u.data_type})`));
    console.log('Tickets columns:', tickets.map(t => `${t.column_name} (${t.data_type})`));
    console.log('Indexes:', indexes.map(i => `${i.indexname} on ${i.tablename}`));

    await closePool();
})().catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
});
