import { Router } from 'express';
import { getOne, list } from '../controllers/template.controller';
import { validate } from '../middleware/validation';
import { listTemplatesQuerySchema, templateIdParamSchema } from '../schemas/common.schema';

const router = Router();

router.get('/', validate(listTemplatesQuerySchema, ['query']), list);
router.get('/:id', validate(templateIdParamSchema, ['params']), getOne);

export default router;
