const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "test-db-merida.c0oen9i4myoj.us-east-2.rds.amazonaws.com",
  user: "admin",
  password: "merida-12345",
  database: "example-merida",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

app.get("/", (req, res) => {
  res.send("API de Productos funcionando!");
});

app.get("/usuarios", (req, res) => {
  pool
    .query("SELECT * FROM usuarios")
    .then(([rows, fields]) => {
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query", err);
      res.status(500).send("Error retrieving users");
    });
});

app.post("/usuarios", (req, res) => {
  const { nombre, email, telefono, edad } = req.body;

  if (!nombre || !email) {
    return res
      .status(400)
      .json({ error: "Los campos nombre y email son obligatorios" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Formato de email inválido" });
  }

  const query =
    "INSERT INTO usuarios (nombre, email, telefono, edad) VALUES (?, ?, ?, ?)";

  pool
    .query(query, [nombre, email, telefono || null, edad || null])
    .then(([result]) => {
      res.status(201).json({
        message: "Usuario creado exitosamente",
        id: result.insertId,
        usuario: { id: result.insertId, nombre, email, telefono, edad },
      });
    })
    .catch((err) => {
      console.error("Error creating user", err);
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "El email ya está registrado" });
      }
      res
        .status(500)
        .json({ error: "Error interno del servidor al crear el usuario" });
    });
});

app.get("/api/products", (req, res) => {
  pool
    .query("SELECT * FROM products")
    .then(([rows, fields]) => {
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query", err);
      res.status(500).json({ error: "Error retrieving products" });
    });
});

app.get("/api/products/:id", (req, res) => {
  const productId = req.params.id;

  pool
    .query("SELECT * FROM products WHERE id = ?", [productId])
    .then(([rows, fields]) => {
      if (rows.length === 0) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
      res.json(rows[0]);
    })
    .catch((err) => {
      console.error("Error executing query", err);
      res.status(500).json({ error: "Error retrieving product" });
    });
});

app.post("/api/products", (req, res) => {
  const { name, description, price, stock, image } = req.body;

  if (!name || !description || !price || stock === undefined) {
    return res.status(400).json({
      error: "Los campos name, description, price y stock son obligatorios",
    });
  }

  if (price < 0) {
    return res.status(400).json({ error: "El precio no puede ser negativo" });
  }

  if (stock < 0) {
    return res.status(400).json({ error: "El stock no puede ser negativo" });
  }

  const query =
    "INSERT INTO products (name, description, price, stock, image, created_at) VALUES (?, ?, ?, ?, ?, NOW())";

  pool
    .query(query, [name, description, price, stock, image || null])
    .then(([result]) => {
      res.status(201).json({
        message: "Producto creado exitosamente",
        id: result.insertId,
        product: {
          id: result.insertId,
          name,
          description,
          price,
          stock,
          image,
          created_at: new Date(),
        },
      });
    })
    .catch((err) => {
      console.error("Error creating product", err);
      res
        .status(500)
        .json({ error: "Error interno del servidor al crear el producto" });
    });
});

app.put("/api/products/:id", (req, res) => {
  const productId = req.params.id;
  const { name, description, price, stock, image } = req.body;

  if (!name || !description || !price || stock === undefined) {
    return res.status(400).json({
      error: "Los campos name, description, price y stock son obligatorios",
    });
  }

  if (price < 0) {
    return res.status(400).json({ error: "El precio no puede ser negativo" });
  }

  if (stock < 0) {
    return res.status(400).json({ error: "El stock no puede ser negativo" });
  }

  const query = `UPDATE products 
                   SET name = ?, description = ?, price = ?, stock = ?, image = ? 
                   WHERE id = ?`;

  pool
    .query(query, [name, description, price, stock, image || null, productId])
    .then(([result]) => {
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      res.json({
        message: "Producto actualizado exitosamente",
        product: { id: productId, name, description, price, stock, image },
      });
    })
    .catch((err) => {
      console.error("Error updating product", err);
      res.status(500).json({
        error: "Error interno del servidor al actualizar el producto",
      });
    });
});

app.delete("/api/products/:id", (req, res) => {
  const productId = req.params.id;

  pool
    .query("DELETE FROM products WHERE id = ?", [productId])
    .then(([result]) => {
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      res.json({ message: "Producto eliminado exitosamente" });
    })
    .catch((err) => {
      console.error("Error deleting product", err);
      res
        .status(500)
        .json({ error: "Error interno del servidor al eliminar el producto" });
    });
});

app.post("/api/purchases", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { user_id, status, details } = req.body;

    if (!user_id || !status || !details || !Array.isArray(details)) {
      return res.status(400).json({
        error: "Los campos user_id, status y details (array) son obligatorios",
      });
    }

    if (details.length === 0) {
      return res.status(400).json({
        error: "Debe haber al menos un producto en la compra",
      });
    }

    if (details.length > 5) {
      return res.status(400).json({
        error: "No se pueden guardar más de 5 productos por compra",
      });
    }

    let total = 0;

    for (const detail of details) {
      if (!detail.product_id || !detail.quantity || !detail.price) {
        throw new Error("Cada detalle debe tener product_id, quantity y price");
      }

      const [productRows] = await connection.execute(
        "SELECT stock, name FROM products WHERE id = ?",
        [detail.product_id]
      );

      if (productRows.length === 0) {
        throw new Error(`Producto con ID ${detail.product_id} no encontrado`);
      }

      const availableStock = productRows[0].stock;
      const productName = productRows[0].name;

      if (availableStock < detail.quantity) {
        throw new Error(
          `Stock insuficiente para ${productName}. Disponible: ${availableStock}, Solicitado: ${detail.quantity}`
        );
      }

      const subtotal = detail.quantity * detail.price;
      total += subtotal;
    }

    if (total > 3500) {
      return res.status(400).json({
        error: `El total de la compra no puede exceder $3500. Total calculado: $${total.toFixed(
          2
        )}`,
      });
    }

    const [purchaseResult] = await connection.execute(
      "INSERT INTO purchases (user_id, total, status, purchase_date) VALUES (?, ?, ?, NOW())",
      [user_id, total, status]
    );

    const purchaseId = purchaseResult.insertId;

    for (const detail of details) {
      const subtotal = detail.quantity * detail.price;

      await connection.execute(
        "INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)",
        [purchaseId, detail.product_id, detail.quantity, detail.price, subtotal]
      );

      await connection.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [detail.quantity, detail.product_id]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Compra creada exitosamente",
      purchase_id: purchaseId,
      total: total,
      details_count: details.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating purchase:", error);
    res.status(500).json({
      error: "Error interno del servidor al crear la compra: " + error.message,
    });
  } finally {
    connection.release();
  }
});

app.get("/api/purchases", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
            SELECT 
                p.id,
                p.total,
                p.status,
                p.purchase_date,
                CONCAT(u.nombre, ' ', u.apellido) as user_name,
                pd.id as detail_id,
                pd.product_id,
                pd.quantity,
                pd.price,
                pd.subtotal,
                pr.name as product_name
            FROM purchases p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN purchase_details pd ON p.id = pd.purchase_id
            LEFT JOIN products pr ON pd.product_id = pr.id
            ORDER BY p.purchase_date DESC
        `);

    const purchasesMap = new Map();

    rows.forEach((row) => {
      if (!purchasesMap.has(row.id)) {
        purchasesMap.set(row.id, {
          id: row.id,
          user: row.user_name,
          total: row.total,
          status: row.status,
          purchase_date: row.purchase_date,
          details: [],
        });
      }

      if (row.detail_id) {
        purchasesMap.get(row.id).details.push({
          id: row.detail_id,
          product: row.product_name,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.price,
          subtotal: row.subtotal,
        });
      }
    });

    const purchases = Array.from(purchasesMap.values());

    res.json(purchases);
  } catch (error) {
    console.error("Error retrieving purchases:", error);
    res.status(500).json({
      error: "Error interno del servidor al obtener las compras",
    });
  }
});

app.get("/api/purchases/:id", async (req, res) => {
  try {
    const purchaseId = req.params.id;

    const [rows] = await pool.execute(
      `
            SELECT 
                p.id,
                p.total,
                p.status,
                p.purchase_date,
                CONCAT(u.nombre, ' ', u.apellido) as user_name,
                pd.id as detail_id,
                pd.product_id,
                pd.quantity,
                pd.price,
                pd.subtotal,
                pr.name as product_name
            FROM purchases p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN purchase_details pd ON p.id = pd.purchase_id
            LEFT JOIN products pr ON pd.product_id = pr.id
            WHERE p.id = ?
            ORDER BY pd.id
        `,
      [purchaseId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Compra no encontrada" });
    }

    const purchase = {
      id: rows[0].id,
      user: rows[0].user_name,
      total: rows[0].total,
      status: rows[0].status,
      purchase_date: rows[0].purchase_date,
      details: [],
    };

    rows.forEach((row) => {
      if (row.detail_id) {
        purchase.details.push({
          id: row.detail_id,
          product: row.product_name,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.price,
          subtotal: row.subtotal,
        });
      }
    });

    res.json(purchase);
  } catch (error) {
    console.error("Error retrieving purchase:", error);
    res.status(500).json({
      error: "Error interno del servidor al obtener la compra",
    });
  }
});

app.put("/api/purchases/:id", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const purchaseId = req.params.id;
    const { user_id, status, details } = req.body;

    const [existingPurchase] = await connection.execute(
      "SELECT status FROM purchases WHERE id = ?",
      [purchaseId]
    );

    if (existingPurchase.length === 0) {
      return res.status(404).json({ error: "Compra no encontrada" });
    }

    if (existingPurchase[0].status === "COMPLETED") {
      return res.status(400).json({
        error: "No se pueden modificar compras con estatus COMPLETED",
      });
    }

    if (details && Array.isArray(details)) {
      if (details.length === 0) {
        return res.status(400).json({
          error: "Debe haber al menos un producto en la compra",
        });
      }

      if (details.length > 5) {
        return res.status(400).json({
          error: "No se pueden guardar más de 5 productos por compra",
        });
      }

      let total = 0;

      for (const detail of details) {
        if (!detail.product_id || !detail.quantity || !detail.price) {
          throw new Error(
            "Cada detalle debe tener product_id, quantity y price"
          );
        }

        const [productRows] = await connection.execute(
          "SELECT stock, name FROM products WHERE id = ?",
          [detail.product_id]
        );

        if (productRows.length === 0) {
          throw new Error(`Producto con ID ${detail.product_id} no encontrado`);
        }

        const availableStock = productRows[0].stock;
        const productName = productRows[0].name;

        if (availableStock < detail.quantity) {
          throw new Error(
            `Stock insuficiente para ${productName}. Disponible: ${availableStock}, Solicitado: ${detail.quantity}`
          );
        }

        const subtotal = detail.quantity * detail.price;
        total += subtotal;
      }

      if (total > 3500) {
        return res.status(400).json({
          error: `El total de la compra no puede exceder $3500. Total calculado: $${total.toFixed(
            2
          )}`,
        });
      }

      const [oldDetails] = await connection.execute(
        "SELECT product_id, quantity FROM purchase_details WHERE purchase_id = ?",
        [purchaseId]
      );

      for (const oldDetail of oldDetails) {
        await connection.execute(
          "UPDATE products SET stock = stock + ? WHERE id = ?",
          [oldDetail.quantity, oldDetail.product_id]
        );
      }

      await connection.execute(
        "DELETE FROM purchase_details WHERE purchase_id = ?",
        [purchaseId]
      );

      for (const detail of details) {
        const subtotal = detail.quantity * detail.price;

        await connection.execute(
          "INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)",
          [
            purchaseId,
            detail.product_id,
            detail.quantity,
            detail.price,
            subtotal,
          ]
        );

        await connection.execute(
          "UPDATE products SET stock = stock - ? WHERE id = ?",
          [detail.quantity, detail.product_id]
        );
      }

      await connection.execute("UPDATE purchases SET total = ? WHERE id = ?", [
        total,
        purchaseId,
      ]);
    }

    const updateFields = [];
    const updateValues = [];

    if (user_id) {
      updateFields.push("user_id = ?");
      updateValues.push(user_id);
    }

    if (status) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    if (updateFields.length > 0) {
      updateValues.push(purchaseId);
      await connection.execute(
        `UPDATE purchases SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );
    }

    await connection.commit();

    res.json({
      message: "Compra actualizada exitosamente",
      purchase_id: purchaseId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating purchase:", error);
    res.status(500).json({
      error:
        "Error interno del servidor al actualizar la compra: " + error.message,
    });
  } finally {
    connection.release();
  }
});

app.delete("/api/purchases/:id", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const purchaseId = req.params.id;

    const [existingPurchase] = await connection.execute(
      "SELECT status FROM purchases WHERE id = ?",
      [purchaseId]
    );

    if (existingPurchase.length === 0) {
      return res.status(404).json({ error: "Compra no encontrada" });
    }

    if (existingPurchase[0].status === "COMPLETED") {
      return res.status(400).json({
        error: "No se pueden eliminar compras con estatus COMPLETED",
      });
    }

    const [details] = await connection.execute(
      "SELECT product_id, quantity FROM purchase_details WHERE purchase_id = ?",
      [purchaseId]
    );

    for (const detail of details) {
      await connection.execute(
        "UPDATE products SET stock = stock + ? WHERE id = ?",
        [detail.quantity, detail.product_id]
      );
    }

    await connection.execute(
      "DELETE FROM purchase_details WHERE purchase_id = ?",
      [purchaseId]
    );

    await connection.execute("DELETE FROM purchases WHERE id = ?", [
      purchaseId,
    ]);

    await connection.commit();

    res.json({
      message: "Compra eliminada exitosamente",
      purchase_id: purchaseId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error deleting purchase:", error);
    res.status(500).json({
      error: "Error interno del servidor al eliminar la compra",
    });
  } finally {
    connection.release();
  }
});

app.listen(port, () => {
  console.log(
    `API de Productos y Compras ejecutándose en http://localhost:${port}`
  );
});
