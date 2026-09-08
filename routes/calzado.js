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

// Helper para extraer la Key relativa de S3 desde una URL pública
function obtenerS3KeyDesdeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return decodeURIComponent(parsedUrl.pathname.substring(1));
  } catch (e) {
    return null;
  }
}

// Helper para limpiar las fotos antiguas de la carpeta en S3 pero EXCLUYENDO las fotos nuevas
async function limpiarArchivosAntiguosS3(bucket, prefijoCarpeta, urlsNuevasConservar) {
  try {
    // 1. Obtener la lista de Keys que queremos CONSERVAR (las que recién subió Flutter)
    const keysAConservar = new Set(
      urlsNuevasConservar
        .map(obtenerS3KeyDesdeUrl)
        .filter((key) => key !== null)
    );

    // 2. Listar todos los objetos existentes dentro de la carpeta en S3
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefijoCarpeta,
    });
    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return; // No hay imágenes previas
    }

    // 3. Filtrar: eliminar solo aquellos archivos cuya Key NO esté en la lista de nuevas imágenes
    const objectsToDelete = listResult.Contents
      .filter((obj) => !keysAConservar.has(obj.Key))
      .map((obj) => ({ Key: obj.Key }));

    if (objectsToDelete.length === 0) {
      return; // Todos los archivos existentes son los nuevos
    }

    // 4. Borrar solo los archivos desactualizados/antiguos
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { 
        Objects: objectsToDelete, 
        Quiet: true 
      },
    });

    await s3Client.send(deleteCommand);
    console.log(`🗑️ Se eliminaron ${objectsToDelete.length} imagen(es) antiguas de la carpeta "${prefijoCarpeta}".`);
  } catch (error) {
    console.error(`Error al limpiar archivos antiguos en S3 (${prefijoCarpeta}):`, error.message);
  }
}

// =================================================================
// 📸 ENDPOINT: Generar Presigned URL para subida a S3
// POST /api/calzado/presigned-url
// =================================================================
router.post('/presigned-url', async (req, res) => {
  try {
    const { id_inventario, nombre, extension, mimeType } = req.body;

    console.log('📌 Solicitud de Presigned URL recibida con datos:', { id_inventario, nombre, extension, mimeType });

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

    // Generar un nombre único para la imagen incluyendo la subcarpeta con el id_inventario
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

    // Higienización de texto
    const nombreLimpio = limpiarNombreCalzado(nombre);

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
      nombreLimpio,
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
      id_inventario,
      imagenes // Array con las URLs definitivas que se van a conservar/guardar
    } = req.body;

    // Higienización de texto
    const nombreLimpio = limpiarNombreCalzado(nombre);

    const parsedCalzadoId = parseInt(id, 10);
    const parsedPrecioReal = parseFloat(precio_real) || 0.0;
    const parsedTipoCalzadoId = id_tipo_calzado ? parseInt(id_tipo_calzado, 10) : null;
    const parsedInventarioId = id_inventario ? parseInt(id_inventario, 10) : null;
    const parsedImagenes = Array.isArray(imagenes) ? imagenes : null;

    // 1. Obtener datos actuales del producto para construir la ruta de la carpeta
    const selectQuery = `SELECT nombre, id_inventario FROM calzado WHERE id_calzado = $1;`;
    const selectResult = await pool.query(selectQuery, [parsedCalzadoId]);

    if (selectResult.rowCount === 0) {
      return res.status(404).json({ error: 'Calzado no encontrado' });
    }

    const calzadoPrevio = selectResult.rows[0];
    const targetBucket = process.env.S3_BUCKET_NAME || 'calza-app-storage-2026';

    const inventarioFolder = parsedInventarioId !== null ? parsedInventarioId : calzadoPrevio.id_inventario;
    const nombreFolder = nombreLimpio || calzadoPrevio.nombre;

    // 2. Ruta exacta de la carpeta del producto
    const folderPrefix = `calzados/${inventarioFolder}/${nombreFolder}/`;

    // 3. Limpiar S3: borra todo lo que esté dentro de la carpeta EXCEPTO lo que venga en `parsedImagenes`
    if (parsedImagenes && parsedImagenes.length > 0) {
      await limpiarArchivosAntiguosS3(targetBucket, folderPrefix, parsedImagenes);
    }

    // 4. Actualizar la base de datos
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
      nombreLimpio,
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

    return res.status(200).json({ message: 'Calzado e imágenes actualizados correctamente' });
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

const limpiarNombreCalzado = (texto) => {
  if (!texto) return '';
  return texto
    .replace(/\//g, '|')      // Cambia '/' por '|'
    .trim()                   // Elimina espacios al inicio y final
    .replace(/\s+/g, ' ');    // Reduce múltiples espacios a uno solo
};

module.exports = router;