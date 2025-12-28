import express from 'express';
import { ContentController } from './content.controller';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middleware/auth';
import validateRequest from '../../middleware/validateRequest';
import { ContentValidation } from './content.validation';
import fileUploadHandler from '../../middleware/fileUploadHandler';
import parseMultipleFileData from '../../middleware/parseMultipleFiledata';
import { FOLDER_NAMES } from '../../../enums/files';


const router = express.Router();

// Content CRUD routes
router
     .route('/')
     // .post(auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), validateRequest(ContentValidation.createContentValidation), ContentController.createContent)
     .get(auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.USER), ContentController.getContent)
     .put(
          auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
          validateRequest(ContentValidation.upsertContentValidation),
          fileUploadHandler(),
          parseMultipleFileData(FOLDER_NAMES.IMAGE),
          ContentController.upsertContent
     )

// Time-range based statistics routes
router.get('/stats/time-range', auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), validateRequest(ContentValidation.timeRangeQuerySchema), ContentController.getTimeRangeStats);

// Donation growth data route
router.get('/stats/donation-growth', auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), validateRequest(ContentValidation.timeRangeQuerySchema), ContentController.getDonationGrowthData);

export const ContentRoutes = router;
