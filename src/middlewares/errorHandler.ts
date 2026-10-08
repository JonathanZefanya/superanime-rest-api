import type { Request, Response, NextFunction } from "express";
import { ValiError } from "valibot";
import { AppError } from "../lib/errors.js";

/**
 * Global error handler middleware.
 * Menangani AppError, ValiError, dan unknown errors.
 */
export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction,
): void {
	// clientCache sudah memasang max-age sebelum handler jalan; error jangan ikut di-cache browser.
	res.set("Cache-Control", "no-store");

	// ValiError -> 400
	if (err instanceof ValiError) {
		const message = err.issues?.[0]?.message || "Validation failed";
		res.status(400).json({
			statusCode: 400,
			statusMessage: "Bad Request",
			message,
		});
		return;
	}

	// AppError -> status sesuai
	if (err instanceof AppError) {
		res.status(err.statusCode).json({
			statusCode: err.statusCode,
			statusMessage: err.statusMessage,
			message: err.message,
		});
		return;
	}

	// Unknown -> 500
	console.error("[ERROR]", err);
	res.status(500).json({
		statusCode: 500,
		statusMessage: "Internal Server Error",
		message: "An unexpected error occurred",
	});
}
