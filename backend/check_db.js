const { DataSource } = require('typeorm');
const path = require('path');

const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  entities: [path.join(__dirname, 'src/entities/*.entity.ts')],
  synchronize: false,
});

async function check() {
  await AppDataSource.initialize();
  const result = await AppDataSource.query('SELECT DISTINCT "group", category FROM stock_item LIMIT 20');
  console.log(JSON.stringify(result, null, 2));
  await AppDataSource.destroy();
}

check().catch(console.error);
