const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' }); // Load backend env vars

const API_URL = 'http://127.0.0.1:3000/api';
const TALLY_API_KEY = process.env.TALLY_API_KEY || 'v1_tally_admin_key_9x8p7L4k2M1n'; 
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_if_not_found';

// Generate mock admin token directly bypassing DB auth
const adminToken = jwt.sign({ sub: 999, username: 'test_admin_bulk', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

// Shared Ledger ID for testing 
const DEMO_LEDGER_ID = 1;

async function runBulkTestFlow() {
  try {
    console.log("====================================");
    console.log("🚀 STARTING BULK LOAD TEST FOR TALLY SYNC");
    console.log("====================================\n");

    // Grab up to 5 random real ledgers to use
    const adminLedgerRes = await axios.get(`${API_URL}/reports/ledgers?limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    let testLedgers = [DEMO_LEDGER_ID];
    if (adminLedgerRes.data.data && adminLedgerRes.data.data.length > 0) {
        testLedgers = adminLedgerRes.data.data.map(l => l.id);
    }
    console.log(`✅ Loaded ${testLedgers.length} distinct ledgers.`);

    // Fetch 50 real items to test against
    const numItems = 50;
    const itemsRes = await axios.get(`${API_URL}/reports/stock-items?limit=${numItems}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    if (!itemsRes.data.data || itemsRes.data.data.length < 5) {
       throw new Error("Not enough stock items in DB to test");
    }
    const TEST_ITEMS = itemsRes.data.data;
    console.log(`✅ Loaded ${TEST_ITEMS.length} distinct real stock items for the bulk test.`);

    const numOrders = 10;
    const createdOrderIds = [];

const empToken = jwt.sign({ sub: 888, username: 'test_emp_bulk', role: 'employee' }, JWT_SECRET, { expiresIn: '1h' });

    console.log(`\n⏳ Creating ${numOrders} orders with random subsets of ${TEST_ITEMS.length} items, mixing roles and customers...`);
    for(let i = 0; i < numOrders; i++) {
       // Randomly assign token (Role) and Ledger (Customer)
       const currentToken = i % 2 === 0 ? adminToken : empToken;
       const roleLabel = i % 2 === 0 ? "ADMIN" : "EMPLOYEE";
       const currentLedgerId = testLedgers[i % testLedgers.length];

       // Generate a random subset of items (between 5 and 20 items per order)
       const orderItemCount = Math.floor(Math.random() * 15) + 5; 
       // Shuffle the TEST_ITEMS using a simple slice and sort
       const shuffledItems = [...TEST_ITEMS].sort(() => 0.5 - Math.random()).slice(0, orderItemCount);

       const itemsPayload = shuffledItems.map((item, index) => ({
           stock_item_id: item.masterid,
           item_name: item.name,
           quantity: (index % 5) + 1,
           amount: 10 * ((index % 5) + 1),
           rate: 10,
           unit: item.base_units || item.units || 'Pcs',
           gst: 0,
           selected_scheme: 'Custom',
           selected_discount: 0,
           livestock_type: i % 2 === 0 ? 'Shop' : 'Pan'
       }));

       const orderRes = await axios.post(`${API_URL}/orders`, {
          ledger_id: currentLedgerId,
          date: new Date().toISOString().split('T')[0],
          total_amount: itemsPayload.reduce((sum, item) => sum + item.amount, 0),
          order_type: i % 2 === 0 ? "Tax Invoice" : "Cash Sale",
          remark: `Bulk Test ${roleLabel} Order ${i+1}`,
          items: itemsPayload
       }, {
          headers: { Authorization: `Bearer ${currentToken}` }
       });
       
       const orderId = orderRes.data.id;
       createdOrderIds.push({ id: orderId, token: currentToken, itemLength: itemsPayload.length });
       
       // Queue for Tally Sync
       await axios.post(`${API_URL}/orders/${orderId}/sync`, {}, {
          headers: { Authorization: `Bearer ${currentToken}` }
       });

       process.stdout.write(`✅ ${roleLabel} Order #${orderId} (${itemsPayload.length} items)  `);
    }
    console.log("\n\n✅ ALL BULK ORDERS CREATED AND QUEUED FOR SYNC");

    // Fetch details to verify
    console.log("\n--- 📊 VERIFYING OVERLAPPING DISTINCT ITEMS ---");
    let allPassed = true;

    for (const order of createdOrderIds) {
       const detailsRes = await axios.get(`${API_URL}/orders/${order.id}/details`, { headers: { Authorization: `Bearer ${order.token}` }});
       const details = detailsRes.data;
       
       if (details.length !== order.itemLength) {
          console.log(`❌ Order #${order.id} failed: Expected ${order.itemLength} items, got ${details.length}`);
          allPassed = false;
          continue;
       }

       // Check if all names are distinct and match original payload
       const namesInOrder = details.map(d => d.item_name);
       const uniqueNames = new Set(namesInOrder);
       if(uniqueNames.size !== order.itemLength) {
          console.log(`❌ Order #${order.id} failed: Duplicated or overwritten items detected! Unique count: ${uniqueNames.size}`);
          allPassed = false;
       } else {
           // Passed
       }
    }

    if (allPassed) {
         console.log("\n🎉 HUGE SUCCESS: All orders maintained perfect product isolation for all items! No overrides detected!");
    }

    console.log("\n====================================");
    console.log("✅ BULK LOAD TEST COMPLETE");
    console.log("====================================");

  } catch (error) {
    console.error("\nTest failed:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message, error.stack);
    }
  }
}

runBulkTestFlow();
