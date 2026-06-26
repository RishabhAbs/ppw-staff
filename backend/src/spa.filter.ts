import { Catch, NotFoundException, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  private clientIndex = join(process.cwd(), 'client', 'index.html');

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    if (
      request.method === 'GET' &&
      !request.path.startsWith('/api') &&
      !request.path.includes('.') &&
      existsSync(this.clientIndex)
    ) {
      return response.sendFile(this.clientIndex);
    }

    response.status(404).json({
      message: exception.message,
      error: 'Not Found',
      statusCode: 404,
    });
  }
}