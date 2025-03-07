const axios = require('axios');
const express = require('express');
const { Sequelize, sequelize, Product, Order, Payment, Customer } = require('../backendProjs/index.js');
const app = express();
app.use(express.json());
const port = 3000;

// ตั้งค่าให้ Express ใช้ EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ดึงข้อมูลเมนูจากฐานข้อมูล
app.get('/', async (req, res) => {
    try {
        const menu = await Product.findAll();
        console.log(menu);  
        res.render('index', { menu });
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).send('Error fetching menu');
    }
});

// เส้นทางสำหรับการชำระเงิน
app.get('/payment', async (req, res) => {
    const productId = req.query.productId;
    const quantity = req.query.quantity;

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const totalPrice = product.Product_Price * quantity;

        res.render('payment', { product, quantity, totalPrice });
    } catch (error) {
        console.error('Error fetching product for payment:', error);
        res.status(500).send('Error fetching product for payment');
    }
});

// เส้นทางสำหรับการตรวจสอบรหัสโปรโมชั่น
app.get('/validate-promotion', async (req, res) => {
    const promotionCode = req.query.code; // รับรหัสโปรโมชั่นจาก query parameter

    try {
        const [promotion] = await sequelize.query(
            'SELECT * FROM Promotions WHERE Promotion_Name = :promotionCode', 
            {
                replacements: { promotionCode },
                type: Sequelize.QueryTypes.SELECT
            }
        );

        if (promotion) {
            const discount = promotion.Promotion_Discount;
            return res.json({ valid: true, discount: discount });
        } else {
            return res.json({ valid: false });
        }
    } catch (error) {
        console.error('Error validating promotion code:', error);
        res.status(500).send('Error validating promotion code');
    }
});

// เส้นทางสำหรับการประมวลผลการชำระเงิน
app.post('/process-payment', async (req, res) => {
    const { productId, quantity, totalPrice, paymentType } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) {
        return res.status(404).send('Product not found');
    }

    try {
        const order = await Order.create({
            Order_Datetime: new Date(),
            Order_Customer_ID: 1, // สามารถแทนที่ด้วย ID ของลูกค้าจาก session หรือ token
            Order_Product_ID: productId,
            Order_Price_Unit: product.Product_Price,
            Order_Total_Price: totalPrice
        });

        // กำหนด Payment_Status ตามประเภทการชำระเงิน
        const paymentStatus = paymentType === 'COD' ? 'Waiting for payment' : 'Pending';

        await Payment.create({
            Payment_Type: paymentType,
            Payment_Amount: totalPrice,
            Payment_Date: new Date(),
            Payment_Order_ID: order.Order_ID,
            Payment_Status: paymentStatus // ใช้ paymentStatus ที่กำหนดไว้
        });

        res.status(200).json({ message: 'Payment processed successfully' });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).send('Error processing payment');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});