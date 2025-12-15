import { StatusCodes } from 'http-status-codes';
import AppError from '../../../errors/AppError';
import { Campaign } from './campaign.model';
import QueryBuilder from '../../builder/QueryBuilder';
import unlinkFile from '../../../shared/unlinkFile';
import { ICampaign } from './campaign.interface';

const createCampaign = async (payload: ICampaign & { image?: string }): Promise<ICampaign> => {
     const createCampaignDto = {
          ...payload,
          cause_image: payload.image,
     };
     const result = await Campaign.create(createCampaignDto);
     if (!result) {
          if (payload.image) {
               unlinkFile(payload.image);
          }
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     return result;
};

const getAllCampaigns = async (query: Record<string, any>): Promise<{ meta: { total: number; page: number; limit: number }; result: ICampaign[] }> => {
     const queryBuilder = new QueryBuilder(Campaign.find(), query);
     const result = await queryBuilder.search(['title', 'description', 'cause_title', 'organization_name']).filter().sort().paginate().fields().modelQuery;
     const meta = await queryBuilder.countTotal();
     return { meta, result };
};

const getAllUnpaginatedCampaigns = async (): Promise<ICampaign[]> => {
     const result = await Campaign.find();
     return result;
};

const updateCampaign = async (id: string, payload: Partial<ICampaign & { image?: string }>): Promise<ICampaign | null> => {
     const isExist = await Campaign.findById(id);
     if (!isExist) {
          if (payload.image) {
               unlinkFile(payload.image);
          }
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }

     if (payload.image && isExist.cause_image) {
          unlinkFile(isExist.cause_image);
     }
     const updateCampaignDto = {
          ...payload,
          cause_image: payload.image,
     };
     return await Campaign.findByIdAndUpdate(id, updateCampaignDto, { new: true });
};

const deleteCampaign = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findById(id);
     if (!result) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     result.isDeleted = true;
     result.deletedAt = new Date();
     await result.save();
     return result;
};

const hardDeleteCampaign = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findByIdAndDelete(id);
     if (!result) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     if (result.cause_image) {
          unlinkFile(result.cause_image);
     }
     return result;
};

const getCampaignById = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findById(id);
     return result;
};

export const campaignService = {
     createCampaign,
     getAllCampaigns,
     getAllUnpaginatedCampaigns,
     updateCampaign,
     deleteCampaign,
     hardDeleteCampaign,
     getCampaignById,
};
