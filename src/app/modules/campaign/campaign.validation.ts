import { z } from 'zod';
import { CampaignStatus } from './campaign.enum';

const commonFields = {
     targetAmount: z.number().min(0, 'Target amount must be a positive number'),
     startDate: z
          .string()
          .or(z.date())
          .transform((val) => new Date(val)),
     endDate: z
          .string()
          .or(z.date())
          .transform((val) => new Date(val)),
     description: z.string().min(10, 'Description must be at least 10 characters'),
     title: z.string().min(3, 'Title must be at least 3 characters'),
     address: z.string().min(5, 'Address is required'),
     donor_name: z.string().min(2, 'Donor name is required'),
     dafPartner: z.string().optional(),
     internalTrackingId: z.string().optional(),
     campaignStatus: z.nativeEnum(CampaignStatus).optional(),
     organization_name: z.string().min(2, 'Organization name is required'),
     organization_network: z.string().optional(),
     organization_type: z.string().optional(),
     organization_taxId: z.string().optional(),
     organization_website: z.string().url('Invalid website URL').or(z.literal('')).optional(),
     organization_address: z.string().optional(),
     contactPerson_name: z.string().min(2, 'Contact person name is required'),
     contactPerson_title: z.string().optional(),
     contactPerson_email: z.string().email('Invalid email address'),
     contactPerson_phone: z.string().optional(),
     cause_title: z.string().min(3, 'Cause title is required'),
     cause_description: z.string().min(10, 'Cause description is required'),
     cause_mission: z.string().optional(),
     cause_image: z.string().url('Invalid image URL').or(z.literal('')).optional(),
};

const createCampaignZodSchema = z.object({
     body: z.object(commonFields).refine(
          (data) => {
               const startDate = new Date(data.startDate);
               const endDate = new Date(data.endDate);
               return endDate > startDate;
          },
          {
               message: 'End date must be after start date',
               path: ['endDate'],
          },
     ),
});

const updateCampaignZodSchema = z.object({
     body: z
          .object({
               ...commonFields,
               startDate: z
                    .string()
                    .or(z.date())
                    .transform((val) => new Date(val))
                    .optional(),
               endDate: z
                    .string()
                    .or(z.date())
                    .transform((val) => new Date(val))
                    .optional(),
               contactPerson_email: z.string().email('Invalid email address').optional(),
          })
          .refine(
               (data) => {
                    if (data.startDate && data.endDate) {
                         const startDate = new Date(data.startDate);
                         const endDate = new Date(data.endDate);
                         return endDate > startDate;
                    }
                    return true;
               },
               {
                    message: 'End date must be after start date',
                    path: ['endDate'],
               },
          ),
});

export const campaignValidation = {
     createCampaignZodSchema,
     updateCampaignZodSchema,
};
