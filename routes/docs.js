import express from 'express';
import fs from 'fs';
import * as yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

const router = express.Router();

const openApiFile = fs.readFileSync('./openapi.yml', 'utf-8');
const openApiDocument = yaml.load(openApiFile);

router.use('/', swaggerUi.serve, swaggerUi.setup(openApiDocument));

export default router;
