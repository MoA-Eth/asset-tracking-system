import dotenv from 'dotenv';
import path from 'path';

// Resolve relative to the backend in both src/ and dist/, regardless of launch directory.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
