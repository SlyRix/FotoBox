// migrate-photos.js
// Run this script to move existing photos to the correct directories
// Usage: node migrate-photos.js

const fs = require('fs');
const path = require('path');

// Define directory paths
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
const INSTAGRAM_PHOTOS_DIR = path.join(__dirname, 'public', 'photos', 'instagram');
const FRAME_PHOTOS_DIR = path.join(__dirname, 'public', 'photos', 'frames');

// Create directories if they don't exist
console.log('Creating directories...');
if (!fs.existsSync(INSTAGRAM_PHOTOS_DIR)) {
    fs.mkdirSync(INSTAGRAM_PHOTOS_DIR, { recursive: true });
    console.log(`Created directory: ${INSTAGRAM_PHOTOS_DIR}`);
}
if (!fs.existsSync(FRAME_PHOTOS_DIR)) {
    fs.mkdirSync(FRAME_PHOTOS_DIR, { recursive: true });
    console.log(`Created directory: ${FRAME_PHOTOS_DIR}`);
}

// Function to migrate photos
async function migratePhotos() {
    try {
        console.log('Starting photo migration...');

        // Read all files in the main photos directory
        const files = fs.readdirSync(PHOTOS_DIR);

        let instagramCount = 0;
        let frameCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each file
        for (const file of files) {
            const filePath = path.join(PHOTOS_DIR, file);

            // Skip if it's a directory or special files
            if (fs.statSync(filePath).isDirectory() || file === 'mosaic.png') {
                skippedCount++;
                continue;
            }

            try {
                // Move instagram_* files to Instagram directory
                if (file.startsWith('instagram_')) {
                    const targetPath = path.join(INSTAGRAM_PHOTOS_DIR, file);
                    fs.renameSync(filePath, targetPath);
                    console.log(`Moved to Instagram directory: ${file}`);
                    instagramCount++;
                }
                // Move frame_* files to frames directory
                else if (file.startsWith('frame_')) {
                    const targetPath = path.join(FRAME_PHOTOS_DIR, file);
                    fs.renameSync(filePath, targetPath);
                    console.log(`Moved to frames directory: ${file}`);
                    frameCount++;
                }
                // Keep other files in the main directory
                else {
                    console.log(`Keeping in main directory: ${file}`);
                    skippedCount++;
                }
            } catch (error) {
                console.error(`Error processing ${file}: ${error.message}`);
                errorCount++;
            }
        }

        // Print summary
        console.log('\nMigration Summary:');
        console.log(`- ${instagramCount} Instagram photos moved to ${INSTAGRAM_PHOTOS_DIR}`);
        console.log(`- ${frameCount} Custom frame photos moved to ${FRAME_PHOTOS_DIR}`);
        console.log(`- ${skippedCount} files kept in main directory`);

        if (errorCount > 0) {
            console.log(`- ${errorCount} errors encountered`);
        }

    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

// Run the migration
migratePhotos().then(() => {
    console.log('Migration completed successfully');
});