const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;

// Serverless optimization: initialize client OUTSIDE the handler
// to enable connection reuse across warm invocations.
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  // Optimize connection pool for serverless environment
  const client = new MongoClient(uri, {
    maxPoolSize: 5,        // Small pool per function instance
    minPoolSize: 0,        // Don't maintain unused connections
    maxIdleTimeMS: 30000,  // Release unused connections quickly (30s)
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000
  });

  await client.connect();
  cachedClient = client;
  return client;
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const data = JSON.parse(event.body);

    let imageUrl = null;
    
    // Upload image to Cloudinary if CLOUDINARY_URL is available
    if (process.env.CLOUDINARY_URL && data.image) {
      try {
        // The frontend sends raw base64 string, so we need to add the data URI prefix
        const base64Image = `data:image/jpeg;base64,${data.image}`;
        const uploadResult = await cloudinary.uploader.upload(base64Image, {
          folder: 'cut_image_telemetry',
          resource_type: 'image'
        });
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError);
        // Continue to save coordinates even if image upload fails
      }
    }
    
    // Connect to MongoDB
    const client = await connectToDatabase();
    const db = client.db('cut_image_ai'); // Automatically creates DB
    const collection = db.collection('telemetry'); // Automatically creates collection

    // Save document
    const doc = {
      timestamp: new Date(),
      mode: data.mode,
      dimensions: data.dimensions,
      coordinates: data.coordinates,
      imageUrl: imageUrl // Will be populated once Cloudinary is added
    };

    const result = await collection.insertOne(doc);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        message: "Data saved to MongoDB",
        id: result.insertedId
      })
    };
  } catch (error) {
    console.error("Error processing telemetry data:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process data" })
    };
  }
};
