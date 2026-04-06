import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { db } from '@ap-bps/shared';
import { signToken } from '../middleware/auth';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0]?.msg });
    }

    const { email, password } = req.body as { email: string; password: string };

    try {
      const user = await db('users').where({ email, status: 'active' }).first();
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const token = signToken({
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        assigned_company: user.assigned_company,
      });

      return res.json({
        success: true,
        data: {
          token,
          user: {
            user_id: user.user_id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            assigned_company: user.assigned_company,
          },
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Login failed' });
    }
  },
);

// POST /api/auth/register  (admin only – done via admin UI, but exposed here)
authRouter.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('full_name').notEmpty(),
    body('role').isIn(['ap_clerk', 'finance_manager', 'admin']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0]?.msg });
    }

    const { email, password, full_name, role, assigned_company } = req.body as {
      email: string;
      password: string;
      full_name: string;
      role: string;
      assigned_company?: string;
    };

    try {
      const existing = await db('users').where({ email }).first();
      if (existing) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const password_hash = await bcrypt.hash(password, 12);
      const [user] = await db('users')
        .insert({ email, password_hash, full_name, role, assigned_company: assigned_company ?? null })
        .returning(['user_id', 'email', 'full_name', 'role', 'assigned_company']);

      return res.status(201).json({ success: true, data: user });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Registration failed' });
    }
  },
);

// GET /api/auth/me
authRouter.get('/me', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

  try {
    const jwt = await import('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { user_id: string };
    const user = await db('users')
      .where({ user_id: payload.user_id })
      .select('user_id', 'email', 'full_name', 'role', 'assigned_company', 'approval_limit')
      .first();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: user });
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
});
