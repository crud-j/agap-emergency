import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new WsException('Unauthorized');
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env['JWT_SECRET'] ?? '',
      });
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }
}
