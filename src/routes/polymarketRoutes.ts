import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { walletAddressParamsSchema } from "../domain/validators.js";
import { getPublicProfile } from "../services/polymarketService.js";

export const registerPolymarketRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/polymarket/profile/:walletAddress", async (request) => {
    const parsedParams = walletAddressParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError(parsedParams.error.errors[0]?.message ?? "Invalid wallet params.", 400);
    }

    return {
      data: await getPublicProfile(parsedParams.data.walletAddress),
      error: null
    };
  });
};
