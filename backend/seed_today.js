const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_URL = 'http://127.0.0.1:3000/api';
// We will authenticate using actual credentials instead of direct JWT signing to test the whole flow
// But wait, the previous test_flow.js used mock tokens. We'll use real auth here.

const USERS = [
    { username: 'admin2', password: 'password123', role: 'admin' },
    { username: 'staff_alice', password: 'password123', name: 'Alice Staff', role: 'employee' },
    { username: 'staff_bob', password: 'password123', name: 'Bob Staff', role: 'employee' }
];

async function seedData() {
    console.log("🌱 Starting Data Seed Process...");
    try {
        // 1. Ensure users exist
        for (const u of USERS.slice(1)) {
            try {
                await axios.post(`${API_URL}/auth/register`, {
                    username: u.username,
                    password: u.password,
                    name: u.name,
                    role: u.role
                });
                console.log(`✅ User created: ${u.username}`);
            } catch(e) { /* ignore if exists */ }
        }

        // 2. Login all users to get tokens and IDs
        const tokens = [];
        for (const u of USERS) {
            const res = await axios.post(`${API_URL}/auth/login`, {
                username: u.username,
                password: u.password
            });
            tokens.push({ 
                user: u.username, 
                role: u.role, 
                token: res.data.access_token,
                id: res.data.user.id 
            });
            console.log(`✅ Logged in: ${u.username} (ID: ${res.data.user.id})`);
        }

        const adminToken = tokens.find(t => t.role === 'admin').token;

        // 3. Get real ledgers
        const ledgersRes = await axios.get(`${API_URL}/reports/ledgers?limit=20`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const ledgers = ledgersRes.data.data;
        if (!ledgers || ledgers.length === 0) throw new Error("No ledgers found");
        console.log(`✅ Fetched ${ledgers.length} ledgers`);

        // 4. Get real stock items
        const itemsRes = await axios.get(`${API_URL}/reports/stock-items?limit=100`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const items = itemsRes.data.data;
        if (!items || items.length === 0) throw new Error("No items found");
        console.log(`✅ Fetched ${items.length} items`);

        // 5. Generate 8 unique orders spread across users for today
        const numOrders = 8;
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);
        const todayDate = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
        console.log(`📅 Seeding for IST Today: ${todayDate}`);

        for (let i = 0; i < numOrders; i++) {
            // Pick a random user token
            const userObj = tokens[i % tokens.length];
            // Pick a random ledger
            const ledger = ledgers[Math.floor(Math.random() * ledgers.length)];
            
            // Generate 2-5 items per order
            const orderItemCount = Math.floor(Math.random() * 4) + 2;
            const shuffledItems = [...items].sort(() => 0.5 - Math.random()).slice(0, orderItemCount);

            const itemsPayload = shuffledItems.map(item => {
                const qty = Math.floor(Math.random() * 10) + 1;
                const rate = (Math.random() * 100 + 10).toFixed(2);
                return {
                    stock_item_id: item.masterid,
                    item_name: item.name,
                    quantity: qty,
                    amount: parseFloat((qty * rate).toFixed(2)),
                    rate: parseFloat(rate),
                    unit: item.base_units || item.units || 'Pcs',
                    gst: 0,
                    selected_scheme: 'Custom',
                    selected_discount: 0,
                    livestock_type: i % 2 === 0 ? 'Shop' : 'Pan'
                };
            });

            const totalAmount = itemsPayload.reduce((sum, item) => sum + item.amount, 0);

            const orderRes = await axios.post(`${API_URL}/orders`, {
                ledger_id: ledger.id,
                date: todayDate,
                total_amount: totalAmount,
                order_type: i % 2 === 0 ? "Tax Invoice" : "Cash Sale",
                remark: `Real daily order by ${userObj.user}`,
                items: itemsPayload,
                created_by: userObj.id
            }, {
                headers: { Authorization: `Bearer ${userObj.token}` }
            });

            console.log(`✅ Placed Order #${orderRes.data.id} for ₹${totalAmount.toFixed(2)} by ${userObj.user} at ${ledger.name}`);
        }

        console.log("🎉 Seed completion done! Check your dashboard now.");

    } catch (e) {
        console.error("❌ Seed failed", e.response ? e.response.data : e.message);
    }
}

seedData();
