
const { DataSource } = require('typeorm');
const { StockItem } = require('./dist/entities/stock-item.entity');

const AppDataSource = new DataSource({
    type: 'sqlite',
    database: 'database.sqlite',
    entities: [StockItem],
    synchronize: false,
});

async function checkItem() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(StockItem);
    
    // Search for the item from the screenshot
    const item = await repo.findOne({
        where: { name: '000041 999 CONFERENCE FILE' }
    });

    console.log('Stock Item Found:', item);
    
    await AppDataSource.destroy();
}

checkItem().catch(console.error);
