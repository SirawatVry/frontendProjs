const axios = require('axios');
const express = require('express');

const CLOUD_URL = '10.104.7.167:5001'; 

const { Sequelize, sequelize, Product, Order, Payment, Customer ,MaterialProduct,Material,Delivery,Employees,customerId,Promotion} = require('./model/index');



const app = express();
app.use(express.json());
const port = process.env.PORT||3000;

// ตั้งค่าให้ Express ใช้ EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ดึงข้อมูลเมนูจากฐานข้อมูล
// Main route to render the index page
app.get('/menu', async (req, res) => {
    const customerId = req.query.customerId; // รับ customerId จาก query parameters
    console.log('Customer ID from query:', customerId); // Debugging
    try {
        const menu = await Product.findAll();
        res.render('index', { menu, customerId }); // ส่ง customerId ไปยัง view
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).send('Error fetching menu');
    }
});

// เส้นทางสำหรับการชำระเงิน
app.get('/payment', async (req, res) => {
    const productId = req.query.productId;
    const quantity = req.query.quantity;
    const customerId = req.query.customerId; // รับ customerId จาก query parameters

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const totalPrice = product.Product_Price * quantity;

        res.render('payment', { product, quantity, totalPrice, customerId }); // ส่ง customerId ไปยัง view
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
// Route for processing payment
app.post('/process-payment', async (req, res) => {
    const { productId, quantity, paymentType, promotionCode, customerId } = req.body; // Include customerId in the request

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fetch materials for the product
        const materials = await MaterialProduct.findAll({
            where: { Product_ID: productId }
        });

        // Check if there are enough materials
        let insufficientMaterials = [];
        for (const material of materials) {
            const materialRecord = await Material.findByPk(material.Material_ID);
            if (materialRecord) {
                const requiredQuantity = 1 * quantity; // Adjust this logic based on your needs
                if (materialRecord.Material_Quantity < requiredQuantity) {
                    insufficientMaterials.push({
                        materialId: material.Material_ID,
                        required: requiredQuantity,
                        available: materialRecord.Material_Quantity
                    });
                }
            }
        }

        // If there are insufficient materials, return an error
        if (insufficientMaterials.length > 0) {
            return res.status(400).json({
                message: 'Insufficient materials for the following items:',
                insufficientMaterials
            });
        }

        // Calculate subtotal
        const subtotal = product.Product_Price * quantity;
        let discountAmount = 0;
        let promotionId = null;

        // Check if a promotion code was provided and validate it
        if (promotionCode) {
            const [promotion] = await sequelize.query(
                'SELECT * FROM Promotions WHERE Promotion_Name = :promotionCode',
                {
                    replacements: { promotionCode },
                    type: Sequelize.QueryTypes.SELECT
                }
            );

            if (promotion) {
                discountAmount = (subtotal * promotion.Promotion_Discount) / 100; // Calculate discount
                promotionId = promotion.Promotion_ID; // Get the Promotion_ID
            }
        }

        // Calculate total price
        const deliveryFee = 30; // Example delivery fee
        const totalPrice = subtotal - discountAmount + deliveryFee;

        // Create the order using the customer ID from the request
        const order = await Order.create({
            Order_Datetime: new Date(),
            Order_Customer_ID: customerId, // Use the customer ID from the request
            Order_Product_ID: productId,
            Order_Quantity: quantity,
            Order_Price_Unit: product.Product_Price,
            Order_Total_Price: totalPrice // Store the total price after discount
        });

        // Deduct materials based on the ordered quantity
        for (const material of materials) {
            const materialRecord = await Material.findByPk(material.Material_ID);
            if (materialRecord) {
                const requiredQuantity = 1 * quantity; // Adjust this logic based on your needs
                materialRecord.Material_Quantity -= requiredQuantity;

                // Update the material record
                await materialRecord.save();
            }
        }

        // Set payment status based on payment type
        const paymentStatus = paymentType === 'COD' ? 'Waiting for payment' : 'Pending';

        // Create the payment record
        await Payment.create({
            Payment_Type: paymentType,
            Payment_Amount: totalPrice,
            Payment_Date: new Date(),
            Payment_Order_ID: order.Order_ID,
            Payment_Status: paymentStatus,
            Payment_Promotion_ID: promotionId
        });

        // Fetch delivery drivers
        const deliveryDrivers = await Employees.findAll({
            where: { Employees_Position: 'Delivery Driver' }
        });

        // Check if there are any delivery drivers available
        if (deliveryDrivers.length === 0) {
            return res.status(400).send('No delivery drivers available');
        }

        // Randomly select a delivery driver
        const randomDriver = deliveryDrivers[Math.floor(Math.random() * deliveryDrivers.length)];

        // Create a delivery record
        await Delivery.create({
            Delivery_Status: 'In transit',
            Delivery_date: new Date(),
            Delivery_Order_ID: order.Order_ID,
            Delivery_Employees_ID: randomDriver.Employees_ID
        });

        res.status(200).json({ message: 'Payment processed successfully and delivery assigned.' });
    } catch (error) {
        console.error('Error processing payment:', error.message); // Log the error message
        res.status(500).send(`Error processing payment: ${error.message}`); // Send the error message in the response
    }
});



// Route for shipping page
// Route for shipping page
app.get('/shipping', async (req, res) => {
    const customerId = req.query.customerId;

    if (!customerId) {
        console.log('Customer ID is required');
        return res.status(400).send('Customer ID is required');
    }

    try {
        const deliveries = await Delivery.findAll({
            include: [
                {
                    model: Order,
                    where: { Order_Customer_ID: customerId }, // ใช้ Order_Customer_ID ในการกรอง
                    include: [
                        {
                            model: Product,
                            attributes: ['Product_Name']
                        },
                        {
                            model: Customer,
                            attributes: ['Customer_Name', 'Customer_address'] // ดึง Customer_Name และ Customer_address
                        }
                    ],
                    attributes: ['Order_ID', 'Order_Quantity', 'Order_Total_Price', 'Order_Datetime']
                },
                {
                    model: Employees,
                    attributes: ['Employees_Name', 'Employees_Phonenumber']
                }
            ]
        });

        res.render('shipping', { deliveries });
    } catch (error) {
        console.error('Error fetching delivery data:', error);
        res.status(500).send('Error fetching delivery data');
    }
});



// Route for login page
app.get('/', (req, res) => {
    res.render('login');
});

app.post('/', async (req, res) => {
    const { phone } = req.body;
    console.log('Login attempt with phone:', phone); // Debugging

    try {
        const customer = await Customer.findOne({ where: { Customer_Phonenumber: phone } });
        if (customer) {
            console.log('Customer found:', customer.Customer_ID); // Debugging
            return res.redirect(`/menu?customerId=${customer.Customer_ID}`);
        }

        const employee = await Employees.findOne({ where: { Employees_Phonenumber: phone, Employees_Position: 'admin' } });
        if (employee) {
            console.log('Admin found, redirecting to admin page'); // Debugging
            return res.redirect('/admin');
        }
        return res.redirect(`/`);    
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});

// Example routes for menu and admin pages


app.get('/admin', (req, res) => {
    res.render('admin');
});
app.get('/register', (req, res) => {
    res.render('register');
});

// Route to handle registration logic
app.post('/register', async (req, res) => {
    const { name, phone, address } = req.body;

    try {
        // Check if the phone number already exists
        const existingCustomer = await Customer.findOne({ where: { Customer_Phonenumber: phone } });
        if (existingCustomer) {
            return res.status(400).send('Phone number already registered.');
        }

        // Create a new customer
        const newCustomer = await Customer.create({
            Customer_Name: name,
            Customer_Phonenumber: phone,
            Customer_address: address
        });

        res.redirect('/');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal server error');
    }
});
// Route to get all customers
app.get('/customers', async (req, res) => {
    const customers = await Customer.findAll();
    res.render('customers', { customers });
});

// Route to get the form to add a new customer
app.get('/customers/new', (req, res) => {
    res.render('newCustomer');
});

// Route to create a new customer
app.post('/customers', async (req, res) => {
    const { name, address, phoneNumber } = req.body;
    await Customer.create({ Customer_Name: name, Customer_address: address, Customer_Phonenumber: phoneNumber });
    res.redirect('/customers');
});

// Route to get the edit form for a customer
app.get('/customers/edit/:id', async (req, res) => {
    const customer = await Customer.findByPk(req.params.id);
    res.render('editCustomer', { customer });
});

app.post('/customers/edit/:id', async (req, res) => {
        console.log("Request body:", req.body); // Log the request body
        const { Customer_Name,Customer_Phonenumber,Customer_Address} = req.body;
        const customerId = req.params.id; // Get the customer ID from the URL
        console.log("Customer data:", { Customer_Name, Customer_Address, Customer_Phonenumber, customerId });
    console.log("Updating customer with ID:", customerId); // Log the ID
    console.log("Customer data:", { Customer_Name, Customer_Address, Customer_Phonenumber }); // Log the customer data

    const sql = `
        UPDATE Customers
        SET Customer_Name = ?, Customer_address = ?, Customer_Phonenumber = ?
        WHERE Customer_ID = ?;
    `;

    try {
        const [results] = await sequelize.query(sql, {
            replacements: [Customer_Name, Customer_Address, Customer_Phonenumber, customerId]
        });

        if (results.affectedRows > 0) {
            return res.redirect('/customers');
        } 
        
    } catch (error) {

    }
});


// Route to delete a customer
app.get('/customers/delete/:id', (req, res) => {
    const customerId = req.params.id;
    const sql = 'DELETE FROM customers WHERE Customer_ID = ?';

    connection.query(sql, [customerId], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            return res.status(500).send('Error deleting customer');
        }
        res.redirect('/customers');
    });
});
// Repeat similar routes for Products
app.get('/products', async (req, res) => {
    const products = await Product.findAll();
    res.render('products', { products });
});

app.get('/products/new', (req, res) => {
    res.render('newProduct');
});

app.post('/products', async (req, res) => {
    const { name, price, description, image } = req.body;
    await Product.create({ Product_Name: name, Product_Price: price, Product_Description: description, Product_image: image });
    res.redirect('/products');
});

app.get('/products/edit/:id', async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    res.render('editProduct', { product });
});

app.post('/products/edit/:id', async (req, res) => {
    const { name, price, description, image } = req.body;
    await Product.update(
        { Product_Name: name, Product_Price: price, Product_Description: description, Product_image: image },
        { where: { Product_ID: req.params.id } }
    );
    res.redirect('/products');
});

app.get('/products/delete/:id', async (req, res) => {
    await Product.destroy({ where: { Product_ID: req.params.id } });
    res.redirect('/products');
});

// Repeat similar routes for Employees
app.get('/employees', async (req, res) => {
    const employees = await Employees.findAll();
    res.render('employees', { employees });
});

app.get('/employees/new', (req, res) => {
    res.render('newEmployee');
});

app.post('/employees', async (req, res) => {
    const { name, position, phoneNumber } = req.body;
    await Employees.create({ Employees_Name: name, Employees_Position: position, Employees_Phonenumber: phoneNumber });
    res.redirect('/employees');
});

app.get('/employees/edit/:id', async (req, res) => {
    const employee = await Employees.findByPk(req.params.id);
    res.render('editEmployee', { employee });
});

app.post('/employees/edit/:id', async (req, res) => {
    const { name, position, phoneNumber } = req.body;
    await Employees.update(
        { Employees_Name: name, Employees_Position: position, Employees_Phonenumber: phoneNumber },
        { where: { Employees_ID: req.params.id } }
    );
    res.redirect('/employees');
});

app.get('/employees/delete/:id', async (req, res) => {
    await Employees.destroy({ where: { Employees_ID: req.params.id } });
    res.redirect('/employees');
});
app.get('/payments', async (req, res) => {
    const payments = await Payment.findAll();
    res.render('payments', { payments });
});

app.get('/payments/new', (req, res) => {
    res.render('newPayment');
});



app.get('/payments/edit/:id', async (req, res) => {
    const payment = await Payment.findByPk(req.params.id);
    res.render('editPayment', { payment });
});

app.post('/payments/edit/:id', async (req, res) => {
    const { type, amount, date, status, orderId } = req.body;

    // ตรวจสอบข้อมูลที่ได้รับ
    if (!type || !amount || !date || !status || !orderId) {
        return res.status(400).send('All fields are required');
    }
    try {
        const orderExists = await Order.findByPk(orderId);
        if (!orderExists) {
            return res.status(400).send('Order ID does not exist');
        }

        const [updated] = await Payment.update(
            { 
                Payment_Type: type, 
                Payment_Amount: amount, 
                Payment_Date: date, 
                Payment_Status: status, 
                Payment_Order_ID: orderId 
            },
            { where: { Payment_ID: req.params.id } }
        );

        if (updated) {
            res.redirect('/payments');
        } else {
            res.status(404).send('Payment not found');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/payments/delete/:id', async (req, res) => {
    await Payment.destroy({ where: { Payment_ID: req.params.id } });
    res.redirect('/payments');
});

// Repeat similar routes for Promotions
app.get('/promotions', async (req, res) => {
    const promotions = await Promotion.findAll();
    res.render('promotions', { promotions });
});

app.get('/promotions/new', (req, res) => {
    res.render('newPromotion');
});

app.post('/promotions', async (req, res) => {
    const { name, discount, startDate, endDate, description } = req.body;
    await Promotion.create({ 
        Promotion_Name: name, 
        Promotion_Discount: discount, 
        Promotion_Start_Date: startDate, 
        Promotion_end_Date: endDate, 
        Promotion_Description: description 
    });
    res.redirect('/promotions');
});

app.get('/promotions/edit/:id', async (req, res) => {
    const promotion = await Promotion.findByPk(req.params.id);
    res.render('editPromotion', { promotion });
});

app.post('/promotions/edit/:id', async (req, res) => {
    const { name, discount, startDate, endDate, description } = req.body;
    await Promotion.update(
        { 
            Promotion_Name: name, 
            Promotion_Discount: discount, 
            Promotion_Start_Date: startDate, 
            Promotion_end_Date: endDate, 
            Promotion_Description: description 
        },
        { where: { Promotion_ID: req.params.id } }
    );
    res.redirect('/promotions');
});

app.get('/promotions/delete/:id', async (req, res) => {
    await Promotion.destroy({ where: { Promotion_ID: req.params.id } });
    res.redirect('/promotions');
});

// Repeat similar routes for Deliveries
app.get('/deliveries', async (req, res) => {
    const deliveries = await Delivery.findAll();
    res.render('deliveries', { deliveries });
});

app.get('/deliveries/new', (req, res) => {
    res.render('newDelivery');
});

app.post('/deliveries', async (req, res) => {
    const { status, date, orderId, employeeId } = req.body;
    await Delivery.create({ 
        Delivery_Status: status, 
        Delivery_date: date, 
        Delivery_Order_ID: orderId, 
        Delivery_Employees_ID: employeeId 
    });
    res.redirect('/deliveries');
});

app.get('/deliveries/edit/:id', async (req, res) => {
    const delivery = await Delivery.findByPk(req.params.id);
    res.render('editDelivery', { delivery });
});

app.post('/deliveries/edit/:id', async (req, res) => {
    const { status, date, orderId, employeeId } = req.body;
    await Delivery.update(
        { 
            Delivery_Status: status, 
            Delivery_date: date, 
            Delivery_Order_ID: orderId, 
            Delivery_Employees_ID: employeeId 
        },
        { where: { Delivery_ID: req.params.id } }
    );
    res.redirect('/deliveries');
});

app.get('/deliveries/delete/:id', async (req, res) => {
    await Delivery.destroy({ where: { Delivery_ID: req.params.id } });
    res.redirect('/deliveries');
});

// Repeat similar routes for Materials
app.get('/materials', async (req, res) => {
    const materials = await Material.findAll();
    res.render('materials', { materials });
});

app.get('/materials/new', (req, res) => {
    res.render('newMaterial');
});

app.post('/materials', async (req, res) => {
    const { name, quantity, unit, dateUpdate } = req.body;
    await Material.create({ 
        Material_Name: name, 
        Material_Quantity: quantity, 
        Material_Unit: unit, 
        Date_Update: dateUpdate 
    });
    res.redirect('/materials');
});

app.get('/materials/edit/:id', async (req, res) => {
    const material = await Material.findByPk(req.params.id);
    res.render('editMaterial', { material });
});

app.post('/materials/edit/:id', async (req, res) => {
    const { name, quantity, unit, dateUpdate } = req.body;
    await Material.update(
        { 
            Material_Name: name, 
            Material_Quantity: quantity, 
            Material_Unit: unit, 
            Date_Update: dateUpdate 
        },
        { where: { Material_ID: req.params.id } }
    );
    res.redirect('/materials');
});

app.get('/materials/delete/:id', async (req, res) => {
    await Material.destroy({ where: { Material_ID: req.params.id } });
    res.redirect('/materials');
});
app.get('/reports', async (req, res) => {
    try {
        // Fetch data from various tables
        const materials = await Material.findAll();
        const customers = await Customer.findAll();
        const employees = await Employees.findAll();
        const products = await Product.findAll();
        const orders = await Order.findAll();
        const payments = await Payment.findAll();
        const promotions = await Promotion.findAll();
        const deliveries = await Delivery.findAll();

        // Fetch payment details with JOINs
        const paymentsWithDetails = await sequelize.query(`
            SELECT o.Order_ID, c.Customer_Name, c.Customer_address, c.Customer_Phonenumber,
                   p.Product_Name AS Order_Product_Name, o.Order_Quantity, 
                   o.Order_Total_Price AS TotalPrice, o.Order_Datetime, 
                   pay.Payment_Type, 
                   CASE 
                       WHEN promo.Promotion_Discount IS NOT NULL THEN promo.Promotion_Discount 
                       ELSE NULL 
                   END AS Promotion_Discount
            FROM orders o
            JOIN customers c ON o.Order_Customer_ID = c.Customer_ID
            JOIN products p ON o.Order_Product_ID = p.Product_ID
            JOIN payments pay ON o.Order_ID = pay.Payment_Order_ID
            LEFT JOIN promotions promo ON pay.Payment_Promotion_ID = promo.Promotion_ID;
        `, { type: Sequelize.QueryTypes.SELECT });

        // Send all data to the EJS view
        res.render('reports', {
            materials,
            customers,
            employees,
            products,
            orders,
            payments: paymentsWithDetails,
            promotions,
            deliveries
        });
    } catch (error) {
        console.error('Error fetching report data:', error);
        res.status(500).send('Error fetching report data');
    }
});
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}/login`);
});