const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Obtener catálogo de calzados por ID de inventario con sus atributos booleanos
// Petición: GET /api/fila_venta_multiple/calzados/:id_inventario
router.get('/calzados/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const queryText = `
            SELECT 
                c.id_calzado,
                c.nombre,
                c.precio_real,
                c.icono,
                c.id_inventario,
                c.id_tipo_calzado,
                c.taco AS tiene_taco,
                c.plataforma AS tiene_plataforma,
                c.colores AS tiene_colores,
                c.activo
            FROM calzado c
            WHERE c.id_inventario = $1 AND c.activo = true
            ORDER BY c.nombre ASC
        `;
        const resultado = await pool.query(queryText, [id_inventario]);
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/fila_venta_multiple/calzados:', error.message);
        res.status(500).json({ error: 'Error al obtener el catálogo de calzados.' });
    }
});

// 2. Consultar stock y opciones disponibles en cascada por Calzado
// GET /api/fila_venta_multiple/stock-cascada/:id_inventario
router.get('/stock-cascada/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    const { id_calzado, talla, colores, taco, plataforma } = req.query;

    try {
        const idInventarioNum = parseInt(id_inventario, 10);
        if (isNaN(idInventarioNum)) {
            return res.status(400).json({ error: 'El id_inventario es obligatorio y debe ser numérico.' });
        }

        // -------------------------------------------------------------
        // Filtros acumulativos para FULL_INVENTORY (Atributos disponibles dinámicos)
        // -------------------------------------------------------------
        let fullWhere = ['fi.id_inventario = $1'];
        let queryParams = [idInventarioNum];
        let paramIndex = 2;

        if (id_calzado && !isNaN(parseInt(id_calzado, 10))) {
            fullWhere.push(`fi.id_calzado = $${paramIndex++}`);
            queryParams.push(parseInt(id_calzado, 10));
        }
        if (talla && !isNaN(parseInt(talla, 10))) {
            fullWhere.push(`si.talla = $${paramIndex++}`);
            queryParams.push(parseInt(talla, 10));
        }
        if (colores && colores.trim() !== '') {
            fullWhere.push(`si.colores = $${paramIndex++}`);
            queryParams.push(colores.trim());
        }
        if (taco && !isNaN(parseInt(taco, 10))) {
            fullWhere.push(`si.taco = $${paramIndex++}`);
            queryParams.push(parseInt(taco, 10));
        }
        // 2. Agregamos la condición para plataforma
        if (plataforma && plataforma.trim() !== '') {
            fullWhere.push(`si.plataforma = $${paramIndex++}`);
            queryParams.push(plataforma.trim());
        }

        const queryText = `
            WITH full_inventory AS (
                -- Trae los atributos filtrados progresivamente según los parámetros recibidos
                SELECT fi.id_calzado, si.talla, si.colores, si.taco, si.plataforma, si.cantidad
                FROM fila_inventario fi
                INNER JOIN subfila_inventario si ON fi.id_fila_inventario = si.id_fila_inventario
                WHERE ${fullWhere.join(' AND ')}
            )
            SELECT 
                COALESCE(SUM(cantidad), 0)::INT AS stock_total,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT id_calzado), NULL) AS calzados_disponibles,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT talla), NULL) AS tallas_disponibles,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT colores), NULL) AS colores_disponibles,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT taco), NULL) AS tacos_disponibles,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT plataforma), NULL) AS plataformas_disponibles
            FROM full_inventory;
        `;

        const resultado = await pool.query(queryText, queryParams);
        const data = resultado.rows[0] || {};

        res.json({
            stock_disponible: data.stock_total || 0,
            calzados_disponibles: data.calzados_disponibles || [],
            tallas_disponibles: data.tallas_disponibles || [],
            colores_disponibles: data.colores_disponibles || [],
            tacos_disponibles: data.tacos_disponibles || [],
            plataformas_disponibles: data.plataformas_disponibles || []
        });

    } catch (error) {
        console.error('Error en GET /stock-cascada:', error);
        res.status(500).json({ error: 'Error al consultar el stock en cascada.' });
    }
});

// 3. Registrar Venta Múltiple (Atómica en Venta, Fila_Venta y Subfila_Inventario)
// Petición: POST /api/fila_venta_multiple/batch
router.post('/batch', async (req, res) => {
    const { items, id_inventario, usuario_creacion, email_user } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La lista de items no puede estar vacía.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const resultadosVentas = [];

        for (const item of items) {
            const {
                id_calzado,
                cantidad,
                colores = '',
                talla,
                taco = 0,
                plataforma = '',
                precio_venta_total,
                metodo_pago,
                lugar_venta,
                fecha_venta,
                id_dueno_muestra = null
            } = item;

            const fechaFinal = fecha_venta || new Date();

            // A. Insertar en tabla `venta`
            const ventaRes = await client.query(
                `INSERT INTO venta (
                    id_calzado,
                    cantidad,
                    colores,
                    fecha_venta,
                    lugar_venta,
                    metodo_pago,
                    plataforma,
                    precio_venta_total,
                    taco,
                    talla,
                    usuario_creacion
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                RETURNING id_venta`,
                [
                    id_calzado,
                    cantidad,
                    colores,
                    fechaFinal,
                    lugar_venta,
                    metodo_pago,
                    plataforma,
                    precio_venta_total,
                    taco,
                    talla,
                    usuario_creacion
                ]
            );

            const id_venta = ventaRes.rows[0].id_venta;

            // B. Insertar en tabla `fila_venta`
            const filaVentaRes = await client.query(
                `INSERT INTO fila_venta (
                    id_venta,
                    id_inventario,
                    id_calzado,
                    cantidad,
                    talla,
                    colores,
                    taco,
                    plataforma,
                    precio_venta_total,
                    metodo_pago,
                    lugar_venta,
                    usuario_creacion,
                    email_user,
                    fecha_venta,
                    id_dueno_muestra
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *`,
                [
                    id_venta,
                    id_inventario,
                    id_calzado,
                    cantidad,
                    talla,
                    colores,
                    taco,
                    plataforma,
                    precio_venta_total,
                    metodo_pago,
                    lugar_venta,
                    usuario_creacion,
                    email_user,
                    fechaFinal,
                    id_dueno_muestra
                ]
            );

            // C. Descontar stock de `subfila_inventario`
            const subfilaRes = await client.query(
                `UPDATE subfila_inventario
                SET cantidad = cantidad - $1
                WHERE id_fila_inventario IN (
                    SELECT id_fila_inventario 
                    FROM fila_inventario 
                    WHERE id_calzado = $2 AND id_inventario = $3
                )
                AND talla = $4
                AND colores = COALESCE(NULLIF($5, ''), '0')
                AND taco = COALESCE(NULLIF($6, ''), '0')
                AND plataforma = COALESCE(NULLIF($7, ''), '0')
                AND cantidad >= $1
                RETURNING id_subfila_inventario, id_fila_inventario`,
                [cantidad, id_calzado, id_inventario, talla, colores, taco, plataforma]
            );

            if (subfilaRes.rows.length === 0) {
                throw new Error(`Stock insuficiente o variante no coincide para el calzado ID: ${id_calzado}`);
            }

            const id_fila_inv = subfilaRes.rows[0].id_fila_inventario;

            // D. Limpieza de variaciones con stock cero
            await client.query(`DELETE FROM subfila_inventario WHERE cantidad <= 0`);

            // E. Recalcular el total acumulado en `fila_inventario`
            await client.query(
                `UPDATE fila_inventario fi
                 SET cantidad = COALESCE((
                     SELECT SUM(cantidad) 
                     FROM subfila_inventario 
                     WHERE id_fila_inventario = fi.id_fila_inventario
                 ), 0)
                 WHERE fi.id_fila_inventario = $1`,
                [id_fila_inv]
            );

            // F. Eliminar la cabecera de inventario si ya no le quedan variaciones
            await client.query(`DELETE FROM fila_inventario WHERE cantidad <= 0`);

            resultadosVentas.push(filaVentaRes.rows[0]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Venta múltiple registrada con éxito.',
            ventas_registradas: resultadosVentas
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en POST /api/fila_venta_multiple/batch:', error.message);
        res.status(400).json({ error: error.message || 'Error procesando la venta múltiple.' });
    } finally {
        client.release();
    }
});

module.exports = router;