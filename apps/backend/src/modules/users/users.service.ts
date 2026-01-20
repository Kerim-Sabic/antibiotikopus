import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@prisma/client';

export interface CreateUserDto {
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  licenseNumber?: string;
  department?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        licenseNumber: data.licenseNumber,
        department: data.department,
      },
    });

    const { passwordHash: _, twoFactorSecret: __, ...result } = user;
    return result;
  }

  async findAll(filters?: { role?: UserRole; isActive?: boolean }) {
    return this.prisma.user.findMany({
      where: filters,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        department: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
        department: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: Partial<CreateUserDto>) {
    const updateData: any = { ...data };

    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      delete updateData.password;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        department: true,
        isActive: true,
      },
    });

    return user;
  }

  async deactivate(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate all sessions
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    return { message: 'User deactivated successfully' };
  }
}
