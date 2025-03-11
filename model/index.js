const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const app = express();
app.use(express.json());
app.use(express.static('public'));  

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./Database/app.sqlite",
});

const Customer = sequelize.define('Customer', {
    Customer_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Customer_Name: DataTypes.STRING,
    Customer_address: DataTypes.STRING,
    Customer_Phonenumber: DataTypes.STRING,
});

const Product = sequelize.define('Product', {
    Product_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Product_Name: DataTypes.STRING,
    Product_Price: DataTypes.INTEGER,
    Product_Description: DataTypes.STRING,
    Product_image: DataTypes.STRING,
});

const Employees = sequelize.define('Employees', {
    Employees_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Employees_Name: DataTypes.STRING,
    Employees_Position: DataTypes.STRING,
    Employees_Phonenumber: DataTypes.STRING,
});

const Order = sequelize.define('Order', {
    Order_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Order_Datetime: DataTypes.DATE,
    Order_Customer_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Customer,
        key: 'Customer_ID',
      }
    },
    Order_Product_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Product,
        key: 'Product_ID',
      }
    },
    Order_Quantity:DataTypes.INTEGER,
    Order_Price_Unit: DataTypes.INTEGER,
    Order_Total_Price: DataTypes.INTEGER,
});

const Promotion = sequelize.define('Promotions', {
    Promotion_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Promotion_Name: DataTypes.STRING,
    Promotion_Discount: DataTypes.INTEGER,
    Promotion_Start_Date: DataTypes.DATE,
    Promotion_end_Date: DataTypes.DATE,
    Promotion_Description: DataTypes.STRING,
}, {
    tableName: 'Promotions', 
});

const Payment = sequelize.define('Payment', {
    Payment_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Payment_Type: DataTypes.STRING,
    Payment_Amount: DataTypes.INTEGER,
    Payment_Date: DataTypes.DATE,
    Payment_Promotion_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Promotion,
        key: 'Promotion_ID',
      }
    },
    Payment_Status: DataTypes.STRING,
    Payment_Order_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Order,
        key: 'Order_ID',
      }
    }
});

const Delivery = sequelize.define('Delivery', {
    Delivery_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Delivery_Status: DataTypes.STRING,
    Delivery_date: DataTypes.DATE,
    Delivery_Order_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Order,
        key: 'Order_ID',
      }
    },
    Delivery_Employees_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Employees,
        key: 'Employees_ID',
      }
    }
});

const Material = sequelize.define('Material', {
    Material_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Material_Name: DataTypes.STRING,
    Material_Quantity: DataTypes.INTEGER,
    Material_Unit: DataTypes.STRING,
    Date_Update: DataTypes.DATE,
});

// Many-to-many relationship using a junction table
const MaterialProduct = sequelize.define('MaterialProduct', {
    Material_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Material,
        key: 'Material_ID',
      },
      primaryKey: true,
    },
    Product_ID: {
      type: DataTypes.INTEGER,
      references: {
        model: Product,
        key: 'Product_ID',
      },
      primaryKey: true,
    },
});

// Many-to-Many Relationships
Material.belongsToMany(Product, { through: MaterialProduct, foreignKey: 'Material_ID' });
Product.belongsToMany(Material, { through: MaterialProduct, foreignKey: 'Product_ID' });
Order.belongsTo(Customer, { foreignKey: 'Order_Customer_ID' });
Order.belongsTo(Product, { foreignKey: 'Order_Product_ID' });
Payment.belongsTo(Order, { foreignKey: 'Payment_Order_ID' });
Payment.belongsTo(Promotion, { foreignKey: 'Payment_Promotion_ID' });
Delivery.belongsTo(Order, { foreignKey: 'Delivery_Order_ID' });
Delivery.belongsTo(Employees, { foreignKey: 'Delivery_Employees_ID' });

module.exports = { Sequelize, sequelize, Product, Customer, Order, Promotion, Payment, Delivery, Material ,MaterialProduct,Employees};

sequelize.sync();



// เริ่มต้นเซิร์ฟเวอร์
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});