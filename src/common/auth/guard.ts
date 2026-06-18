import { NextFunction, Request, Response } from "express";
import { NotAuthenticated } from "./errors";
import { verifyAccessToken, verifyRefreshToken } from "../../app/auth/utlis";


type TokenType = 'access' | 'refresh';

export function authenticate(tokenType: TokenType = 'access') {
    
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieName = tokenType === 'access' ? 'access_token' : 'refresh_token';
    const token = req.cookies[cookieName];
    
    if (!token) {
      throw NotAuthenticated;
    }

    const verifyFn = tokenType === 'access' ? verifyAccessToken : verifyRefreshToken;
    req.user = verifyFn(token);
    next();
  };
}