const mongoose = require('mongoose');

async function dropEmailIndex() {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 0) {
      // Replace with your actual MongoDB connection string
      await mongoose.connect("mongodb+srv://test:J62woiyoKXiosIUn@cluster0.okfsytr.mongodb.net/auth");
      console.log('Connected to MongoDB for index cleanup');
    }
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    // Check existing indexes
    console.log('Checking existing indexes...');
    const indexes = await collection.listIndexes().toArray();
    console.log('Current indexes:', indexes.map(idx => `${idx.name}: ${JSON.stringify(idx.key)}`));
    
    // Drop the problematic email index
    try {
      await collection.dropIndex('email_1');
      console.log('✅ Successfully dropped email_1 index');
    } catch (error) {
      if (error.message.includes('index not found')) {
        console.log('ℹ️  email_1 index does not exist (already dropped or never created)');
      } else {
        console.log('⚠️  Error dropping email_1 index:', error.message);
      }
    }
    
    // Also drop mobile index if it exists and is problematic
    try {
      await collection.dropIndex('mobile_1');
      console.log('✅ Successfully dropped mobile_1 index');
    } catch (error) {
      if (error.message.includes('index not found')) {
        console.log('ℹ️  mobile_1 index does not exist');
      } else {
        console.log('⚠️  Error dropping mobile_1 index:', error.message);
      }
    }
    
    // Clean up existing problematic data
    console.log('Cleaning up existing data...');
    
    // Remove null email fields
    const result1 = await collection.updateMany(
      { email: null },
      { $unset: { email: 1 } }
    );
    console.log(`Cleaned ${result1.modifiedCount} documents with null emails`);
    
    // Remove empty string emails
    const result2 = await collection.updateMany(
      { email: "" },
      { $unset: { email: 1 } }
    );
    console.log(`Cleaned ${result2.modifiedCount} documents with empty emails`);
    
    // Do the same for mobile
    const result3 = await collection.updateMany(
      { mobile: null },
      { $unset: { mobile: 1 } }
    );
    console.log(`Cleaned ${result3.modifiedCount} documents with null mobile`);
    
    const result4 = await collection.updateMany(
      { mobile: "" },
      { $unset: { mobile: 1 } }
    );
    console.log(`Cleaned ${result4.modifiedCount} documents with empty mobile`);
    
    console.log('✅ Index cleanup and data cleaning complete!');
    console.log('🔄 Restart your application to let Mongoose create proper indexes');
    
  } catch (error) {
    console.error('❌ Error during index cleanup:', error);
    throw error;
  }
}

module.exports = { dropEmailIndex };