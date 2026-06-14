import express from "express";
import { getSupportedModels } from "../services/models";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    models: getSupportedModels(),
  });
});

export default router;
