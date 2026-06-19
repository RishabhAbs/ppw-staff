import { ExceptionFilter, Catch, NotFoundException, ArgumentsHost } from '@nestjs/common';
import { Response, Request } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  private readonly clientIndex = join(process.cwd(), 'client', 'index.html');

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Non-API GET request without file extension → serve index.html (SPA fallback)
    if (
      request.method === 'GET' &&
      !request.path.startsWith('/api') &&
      !request.path.includes('.') &&
      existsSync(this.clientIndex)
    ) {
      return response.sendFile(this.clientIndex);
    }

    // Otherwise return normal 404
    response.status(404).json({
      message: exception.message,
      error: 'Not Found',
      statusCode: 404,
    });
  }
}
