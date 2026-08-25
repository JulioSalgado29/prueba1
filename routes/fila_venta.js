const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar ventas por ID de inventario y filtrado opcional por fecha (YYYY-MM-DD)
// Petición: GET /api/fila_venta/inventario/:id_inventario?fecha=2026-08-24
router.get('/inventario/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    const { fecha } = req.query;

    try {
        let queryText = `
      SELECT 
        fv.id_fila_venta,
        fv.id_venta,
        fv.id_inventario,
        fv.id_calzado,
        fv.cantidad,
        fv.talla,
        fv.colores,
        fv.taco,
        fv.plataforma,
        fv.precio_venta_total,
        fv.metodo_pago,
        fv.lugar_venta,
        fv.usuario_creacion,
        fv.email_user,
        fv.fecha_creacion,
        fv.fecha_venta,
        c.nombre AS calzado_nombre,
        c.icono AS calzado_icono,
        dm.id_dueno_muestra,
        dm.nombre AS dueno_muestra_nombre
      FROM fila_venta fv
      INNER JOIN calzado c ON c.id_calzado = fv.id_calzado
      LEFT JOIN dueno_muestra dm 
        ON dm.id_inventario = fv.id_inventario 
       AND dm.id_dueno_muestra = fv.id_dueno_muestra
      WHERE fv.id_inventario = $1
    `;

        const queryParams = [id_inventario];

        if (fecha) {
            queryText += ` AND DATE(fv.fecha_creacion) = $2`;
            queryParams.push(fecha);
        }

        queryText += ` ORDER BY fv.fecha_creacion DESC`;

        const resultado = await pool.query(queryText, queryParams);
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/fila_venta/inventario:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Eliminar venta o muestra con reversa de stock atómica
// Petición: DELETE /api/fila_venta/:id_fila_venta
router.delete('/:id_fila_venta', async (req, res) => {
    const { id_fila_venta } = req.params;
    const { esMuestra, data } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (!esMuestra) {
            const {
                id_calzado,
                id_dueno_muestra,
                id_inventario,
                cantidad,
                talla,
                colores = '',
                taco = 0,
                plataforma = '',
                email_user,
                usuario_creacion
            } = data;

            // A. Buscar o crear la fila_inventario
            let filaInvRes = await client.query(
                `SELECT id_fila_inventario 
         FROM fila_inventario 
         WHERE id_calzado = $1 AND id_inventario = $2 
         LIMIT 1`,
                [id_calzado, id_inventario]
            );

            let id_fila_inventario;

            if (filaInvRes.rows.length === 0) {
                const nuevaFilaRes = await client.query(
                    `INSERT INTO fila_inventario 
            (id_calzado, id_inventario, cantidad, email_user, usuario_creacion)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id_fila_inventario`,
                    [id_calzado, id_inventario, cantidad, email_user, usuario_creacion]
                );
                id_fila_inventario = nuevaFilaRes.rows[0].id_fila_inventario;
            } else {
                id_fila_inventario = filaInvRes.rows[0].id_fila_inventario;
                await client.query(
                    `UPDATE fila_inventario 
           SET cantidad = cantidad + $1 
           WHERE id_fila_inventario = $2`,
                    [cantidad, id_fila_inventario]
                );
            }

            // B. Buscar o crear la subfila_inventario (variante)
            const subfilaRes = await client.query(
                `SELECT id_subfila_inventario 
         FROM subfila_inventario 
         WHERE id_fila_inventario = $1 
           AND talla = $2 
           AND colores = $3 
           AND taco = $4 
           AND plataforma = $5 
         LIMIT 1`,
                [id_fila_inventario, talla, colores, taco, plataforma]
            );

            if (subfilaRes.rows.length > 0) {
                await client.query(
                    `UPDATE subfila_inventario 
           SET cantidad = cantidad + $1 
           WHERE id_subfila_inventario = $2`,
                    [cantidad, subfilaRes.rows[0].id_subfila_inventario]
                );
            } else {
                await client.query(
                    `INSERT INTO subfila_inventario 
            (id_fila_inventario, talla, colores, taco, plataforma, cantidad, email_user, usuario_creacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        id_fila_inventario,
                        talla,
                        colores,
                        taco,
                        plataforma,
                        cantidad,
                        email_user,
                        usuario_creacion
                    ]
                );
            }
        }

        // C. Eliminar fila_venta y venta principal
        await client.query(
            `DELETE FROM fila_venta WHERE id_fila_venta = $1`,
            [id_fila_venta]
        );

        if (data.id_venta) {
            await client.query(
                `DELETE FROM venta WHERE id_venta = $1`,
                [data.id_venta]
            );
        }

        await client.query('COMMIT');
        res.json({ message: esMuestra ? 'Muestra eliminada.' : 'Venta eliminada y stock restaurado.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en DELETE /api/fila_venta:', error.message);
        res.status(500).json({ error: 'Error al procesar la eliminación' });
    } finally {
        client.release();
    }
});

// 3. Crear venta / muestra (Inserta en venta, fila_venta y descuenta stock)
// Petición: POST /api/fila_venta
router.post('/', async (req, res) => {
    const {
        id_inventario,
        id_calzado,
        talla,
        taco = 0,
        colores = '',
        plataforma = '',
        cantidad,
        precio_venta_total,
        metodo_pago,
        lugar_venta,
        fecha_venta,
        usuario_creacion,
        email_user,
        muestra = false
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Insertar en tabla `venta` (incluye todos sus campos NOT NULL)
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
                fecha_venta || new Date(),
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
                id_dueno_muestra,
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
                fecha_venta
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                id_venta,
                id_inventario,
                id_dueno_muestra,
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
                fecha_venta || new Date()
            ]
        );

        // C. Si NO es muestra, descontar stock de `subfila_inventario`
        if (!muestra) {
            const subfilaRes = await client.query(
                `UPDATE subfila_inventario
                 SET cantidad = cantidad - $1
                 WHERE id_fila_inventario IN (
                     SELECT id_fila_inventario 
                     FROM fila_inventario 
                     WHERE id_calzado = $2 AND id_inventario = $3
                 )
                 AND talla = $4
                 AND colores = $5
                 AND taco = $6
                 AND plataforma = $7
                 RETURNING id_subfila_inventario`,
                [cantidad, id_calzado, id_inventario, talla, colores, taco, plataforma]
            );

            if (subfilaRes.rows.length === 0) {
                throw new Error('No se encontró el stock de la variante seleccionada para descontar.');
            }
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: muestra ? 'Muestra registrada con éxito.' : 'Venta registrada y stock actualizado.',
            fila_venta: filaVentaRes.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en POST /api/fila_venta:', error.message);
        res.status(500).json({ error: error.message || 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;