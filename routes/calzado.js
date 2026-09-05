const express = require('express');
const router = express.Router();
const pool = require('../db');
const { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectsCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

// Configuración del Cliente AWS S3
const REGION = process.env.AWS_REGION || 'us-east-1';
const s3Client = new S3Client({ 
  region: REGION,
  useAccelerateEndpoint: true, // ⚡ Activa el endpoint de velocidad optimizada
});

// Helper para eliminar todos los objetos dentro de una carpeta (prefix) en S3
async function eliminarCarpetaS3(bucket, prefijo) {
  try {
    // 1. Listar los objetos almacenados dentro de la carpeta/prefijo
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefijo,
    });
    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return; // La carpeta está vacía o no existe
    }

    // 2. Extraer las Keys de todos los archivos a eliminar
    const objectsToDelete = listResult.Contents.map((obj) => ({ Key: obj.Key }));

    // 3. Ejecutar borrado masivo
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { 
        Objects: objectsToDelete, 
        Quiet: true 
      },
    });

    await s3Client.send(deleteCommand);
    console.log(`🗑️ Se eliminó la carpeta S3 "${prefijo}" (${objectsToDelete.length} archivos).`);
  } catch (error) {
    console.error(`Error al eliminar la carpeta S3 (${prefijo}):`, error.message);
  }
}

// =================================================================
// 📸 ENDPOINT: Generar Presigned URL para subida a S3
// POST /api/calzado/presigned-url
// =================================================================
router.post('/presigned-url', async (req, res) => {
  try {
    const { id_inventario, nombre, extension, mimeType } = req.body;

    if (!id_inventario) {
      return res.status(400).json({ error: 'El id_inventario es requerido' });
    }

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Obtener el nombre del bucket de la variable o usar el fallback directo
    const targetBucket = process.env.S3_BUCKET_NAME || 'calza-app-storage-2026';

    // Normalizar la extensión del archivo
    const cleanExt = extension ? extension.replace('.', '').toLowerCase() : 'jpg';

    // Ruta de carpeta coincidente: calzados/{id_inventario}/{nombre}/
    const fileName = `calzados/${id_inventario}/${nombre}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${cleanExt}`;

    // Determinar el tipo de contenido
    const contentType = mimeType || (cleanExt === 'png' ? 'image/png' : 'image/jpeg');

    console.log(`📌 Generando Presigned URL para Bucket: "${targetBucket}", File: "${fileName}"`);

    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: fileName,
      ContentType: contentType,
    });

    // Generar la URL firmada (expira en 5 minutos)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // URL pública final del archivo en S3
    const fileUrl = `https://${targetBucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;

    return res.json({ 
      uploadUrl, 
      fileUrl,
      key: fileName 
    });
  } catch (error) {
    console.error('Error generando Presigned URL de S3:', error);
    return res.status(500).json({ error: 'Error al generar la URL de subida' });
  }
});

// 1. Listar calzados activos por inventario
// Petición: GET /api/calzado/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario,
        imagenes
      FROM calzado
      WHERE activo = true AND 
            id_inventario = $1
      ORDER BY fecha_creacion DESC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 1.1 Listar calzados activos por inventario
// Petición: GET /api/calzado/inventario/update/:id_inventario
router.get('/inventario/update/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario,
        imagen_url
      FROM calzado
      WHERE activo = true AND 
            (id_inventario = $1 OR id_inventario = 0)
      ORDER BY fecha_creacion DESC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario/update:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Listar calzados activos por inventario QUE TENGAN COLORES EN TRUE
// Petición: GET /api/calzado/inventario/:id_inventario/colores
router.get('/inventario/:id_inventario/colores', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario,
        imagen_url
      FROM calzado
      WHERE activo = true 
        AND colores = true
        AND id_inventario = $1
      ORDER BY nombre ASC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario/:id_inventario/colores:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un calzado por ID
// Petición: GET /api/calzado/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario,
        imagen_url
      FROM calzado
      WHERE id_calzado = $1 AND activo = true`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Calzado no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear un nuevo calzado
// POST /api/calzado
router.post('/', async (req, res) => {
  try {
    const {
      nombre,
      icono,
      precio_real,
      taco,
      plataforma,
      colores,
      id_tipo_calzado,
      usuario_creacion,
      email_usuario,
      id_inventario,
      imagenes
    } = req.body;

    // Conversión e higienización segura de tipos
    const parsedPrecioReal = parseFloat(precio_real) || 0.0;
    const parsedTipoCalzadoId = id_tipo_calzado ? parseInt(id_tipo_calzado, 10) : null;
    const parsedInventarioId = id_inventario ? parseInt(id_inventario, 10) : null;
    const parsedImagenes = Array.isArray(imagenes) ? imagenes : [];

    const query = `
      INSERT INTO calzado (
        nombre, 
        icono, 
        precio_real, 
        taco, 
        plataforma, 
        colores,
        id_tipo_calzado, 
        usuario_creacion, 
        email_usuario, 
        id_inventario, 
        activo,
        imagenes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
      RETURNING id_calzado;
    `;

    const values = [
      nombre || '',
      icono || '',
      parsedPrecioReal,
      Boolean(taco),
      Boolean(plataforma),
      Boolean(colores),
      parsedTipoCalzadoId,
      usuario_creacion || null,
      email_usuario || null,
      parsedInventarioId,
      parsedImagenes
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: 'Calzado creado exitosamente',
      id_calzado: result.rows[0].id_calzado
    });
  } catch (error) {
    console.error('Error detallado al crear calzado:', error.message);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detalle: error.message 
    });
  }
});

// Editar un calzado existente
// PUT /api/calzado/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      icono,
      precio_real,
      taco,
      plataforma,
      colores,
      id_tipo_calzado,
      usuario_creacion,
      email_usuario,
      id_inventario, // Importante para calcular el prefijo de la carpeta S3
      imagenes
    } = req.body;

    // Conversión e higienización segura de tipos
    const parsedCalzadoId = parseInt(id, 10);
    const parsedPrecioReal = parseFloat(precio_real) || 0.0;
    const parsedTipoCalzadoId = id_tipo_calzado ? parseInt(id_tipo_calzado, 10) : null;
    const parsedInventarioId = id_inventario ? parseInt(id_inventario, 10) : null;
    const parsedImagenes = Array.isArray(imagenes) ? imagenes : null;

    // 1. Obtener datos actuales del registro para verificar si cambió el nombre o inventario
    const selectQuery = `SELECT nombre, id_inventario FROM calzado WHERE id_calzado = $1;`;
    const selectResult = await pool.query(selectQuery, [parsedCalzadoId]);

    if (selectResult.rowCount === 0) {
      return res.status(404).json({ error: 'Calzado no encontrado' });
    }

    const calzadoPrevio = selectResult.rows[0];
    const targetBucket = process.env.S3_BUCKET_NAME || 'calza-app-storage-2026';

    // Usar datos entrantes o los guardados previamente en caso de que no vengan en el body
    const inventarioFolder = parsedInventarioId !== null ? parsedInventarioId : calzadoPrevio.id_inventario;
    const nombreFolder = nombre || calzadoPrevio.nombre;

    // 2. Ruta exacta del prefijo/carpeta del producto
    const folderPrefix = `calzados/${inventarioFolder}/${nombreFolder}/`;

    // 3. Purgar la carpeta completa en S3 antes de asociar las nuevas URLs
    await eliminarCarpetaS3(targetBucket, folderPrefix);

    // 4. Actualizar el registro en la base de datos
    const updateQuery = `
      UPDATE calzado SET
        nombre = $1,
        icono = $2,
        precio_real = $3,
        taco = $4,
        plataforma = $5,
        colores = $6,
        id_tipo_calzado = $7,
        usuario_creacion = $8,
        email_usuario = $9,
        imagenes = COALESCE($10, imagenes)
      WHERE id_calzado = $11;
    `;

    const values = [
      nombre || '',
      icono || '',
      parsedPrecioReal,
      Boolean(taco),
      Boolean(plataforma),
      Boolean(colores),
      parsedTipoCalzadoId,
      usuario_creacion || null,
      email_usuario || null,
      parsedImagenes,
      parsedCalzadoId
    ];

    await pool.query(updateQuery, values);

    return res.status(200).json({ message: 'Calzado y carpeta de imágenes actualizados correctamente' });
  } catch (error) {
    console.error('Error detallado al actualizar calzado:', error.message);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detalle: error.message 
    });
  }
});

// Eliminar calzado (Baja lógica)
// Petición: DELETE /api/calzado/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE calzado SET activo = $2 WHERE id_calzado = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'calzado no encontrado' });
    }

    res.json({ mensaje: 'calzado eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;