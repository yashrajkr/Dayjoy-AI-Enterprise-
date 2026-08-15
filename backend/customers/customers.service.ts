import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import {
  CreateCustomerDto,
  CustomerSourceEnum,
  CustomerTypeEnum,
} from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import {
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/create-address.dto';
import { AuthenticatedUser } from '../users/users.service';

interface Address {
  id: string;
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RECENT_ORDERS_LIMIT = 5;

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private parseAddresses(raw: Prisma.JsonValue | null): Address[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as Address[];
  }

  private writeAudit(
    tenantId: string,
    actorId: string | null,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    resourceType: string,
    resourceId: string,
    oldValues?: Prisma.JsonValue,
    newValues?: Prisma.JsonValue,
  ): void {
    Promise.resolve()
      .then(() =>
        this.prisma.auditLog.create({
          data: {
            tenantId,
            userId: actorId,
            action,
            resourceType,
            resourceId,
            oldValues: oldValues as Prisma.InputJsonValue | undefined,
            newValues: newValues as Prisma.InputJsonValue | undefined,
          },
        }),
      )
      .catch((err) =>
        this.logger.error(
          `Failed to write audit log (${action} ${resourceType}:${resourceId}): ${(err as Error).message}`,
        ),
      );
  }

  // -------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------

  async findAll(query: QueryCustomersDto, currentUser: AuthenticatedUser) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      tenantId: currentUser.tenantId,
      status: { not: 'deleted' },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.customerType) {
      where.customerType = query.customerType;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { orders: true } },
          orders: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Flatten `_count` and the latest-order probe into a friendlier shape.
    const data = customers.map((c) => {
      const { _count, orders, ...rest } = c;
      return {
        ...rest,
        addressCount: this.parseAddresses(rest.address).length,
        orderCount: _count.orders,
        lastOrderAt: orders[0]?.createdAt ?? null,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: RECENT_ORDERS_LIMIT,
          include: { items: true },
        },
      },
    });

    if (!customer || customer.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    const stats = await this.getStats(id, currentUser);

    return {
      ...customer,
      addresses: this.parseAddresses(customer.address),
      lifetimeStats: stats,
    };
  }

  // -------------------------------------------------------------------
  // Create / Update / Delete
  // -------------------------------------------------------------------

  async create(dto: CreateCustomerDto, currentUser: AuthenticatedUser) {
    if (dto.customerType === CustomerTypeEnum.BUSINESS && !dto.companyName) {
      throw new BadRequestException(
        'companyName is required for BUSINESS customers',
      );
    }

    // Email-uniqueness guard (per-tenant). The schema does not have a
    // composite unique constraint on (tenantId, email) so this is a
    // service-level check.
    if (dto.email) {
      const existing = await this.prisma.customer.findFirst({
        where: { tenantId: currentUser.tenantId, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'Customer with this email already exists in this tenant',
        );
      }
    }

    // Build the initial addresses JSON array. The supplied address (if any)
    // is the first one and is automatically the default for both shipping
    // and billing (unless explicitly overridden).
    const addresses: Address[] = [];
    if (dto.address) {
      addresses.push({
        id: randomUUID(),
        label: dto.address.label,
        line1: dto.address.line1,
        line2: dto.address.line2,
        city: dto.address.city,
        state: dto.address.state,
        postalCode: dto.address.postalCode,
        country: dto.address.country,
        isDefaultShipping: dto.address.isDefaultShipping ?? true,
        isDefaultBilling: dto.address.isDefaultBilling ?? true,
      });
    }

    // Optional: link to a user account. If a User with the supplied email
    // already exists (e.g. created by the auth flow), link to it; otherwise
    // create a `customer`-role user with no password (the customer will go
    // through a "set password" flow later).
    let userId: string | undefined;
    if (dto.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: { email: dto.email },
      });
      if (existingUser && existingUser.tenantId === currentUser.tenantId) {
        userId = existingUser.id;
      } else if (!existingUser) {
        const user = await this.prisma.user.create({
          data: {
            tenantId: currentUser.tenantId,
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            role: 'customer',
            status: 'ACTIVE',
          },
        });
        userId = user.id;
        this.logger.log(
          `TODO: queue 'set-password' email for new customer user ${user.email}`,
        );
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        tenantId: currentUser.tenantId,
        userId,
        customerType: dto.customerType,
        companyName: dto.companyName,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        address: addresses as unknown as Prisma.InputJsonValue,
        status: 'active',
      },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'INSERT',
      'Customer',
      customer.id,
      undefined,
      { email: customer.email, customerType: customer.customerType },
    );

    return customer;
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    currentUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    if (
      dto.customerType === CustomerTypeEnum.BUSINESS &&
      dto.companyName === undefined &&
      existing.companyName === null
    ) {
      throw new BadRequestException(
        'companyName is required for BUSINESS customers',
      );
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.customerType !== undefined) data.customerType = dto.customerType;
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.customer.update({
      where: { id },
      data,
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'Customer',
      id,
      { email: existing.email, phone: existing.phone },
      { email: updated.email, phone: updated.phone },
    );

    return updated;
  }

  /**
   * Soft-delete: marks the customer `deleted`. The schema has no
   * `deletedAt` column on `Customer`, so `status = 'deleted'` is the
   * canonical tombstone (consistent with how `findAll` filters them out).
   */
  async remove(id: string, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    await this.prisma.customer.update({
      where: { id },
      data: { status: 'deleted' },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'DELETE',
      'Customer',
      id,
      { email: existing.email, companyName: existing.companyName },
      { status: 'deleted' },
    );

    return { success: true };
  }

  // -------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------

  async getStats(id: string, currentUser: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || customer.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    const [agg, lastOrder] = await Promise.all([
      this.prisma.order.aggregate({
        where: { customerId: id, status: { not: 'CANCELLED' } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      this.prisma.order.findFirst({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, total: true },
      }),
    ]);

    return {
      lifetimeValue: agg._sum.total ?? 0,
      totalOrders: agg._count,
      avgOrderValue: agg._avg.total ?? 0,
      lastOrderAt: lastOrder?.createdAt ?? null,
      lastOrderValue: lastOrder?.total ?? null,
    };
  }

  // -------------------------------------------------------------------
  // Addresses (stored as JSON array on Customer.address)
  // -------------------------------------------------------------------

  async addAddress(
    customerId: string,
    dto: CreateAddressDto,
    currentUser: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const addresses = this.parseAddresses(customer.address);

    // If this address is flagged default, unset the same flag on the others.
    if (dto.isDefaultShipping) {
      addresses.forEach((a) => (a.isDefaultShipping = false));
    }
    if (dto.isDefaultBilling) {
      addresses.forEach((a) => (a.isDefaultBilling = false));
    }

    const newAddress: Address = {
      id: randomUUID(),
      label: dto.label,
      line1: dto.line1,
      line2: dto.line2,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      country: dto.country,
      isDefaultShipping: dto.isDefaultShipping ?? addresses.length === 0,
      isDefaultBilling: dto.isDefaultBilling ?? addresses.length === 0,
    };
    addresses.push(newAddress);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { address: addresses as unknown as Prisma.InputJsonValue },
    });

    return newAddress;
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    currentUser: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const addresses = this.parseAddresses(customer.address);
    const idx = addresses.findIndex((a) => a.id === addressId);
    if (idx === -1) {
      throw new NotFoundException(
        `Address ${addressId} not found on customer ${customerId}`,
      );
    }

    const updated: Address = {
      ...addresses[idx],
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.line1 !== undefined ? { line1: dto.line1 } : {}),
      ...(dto.line2 !== undefined ? { line2: dto.line2 } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.state !== undefined ? { state: dto.state } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.isDefaultShipping !== undefined
        ? { isDefaultShipping: dto.isDefaultShipping }
        : {}),
      ...(dto.isDefaultBilling !== undefined
        ? { isDefaultBilling: dto.isDefaultBilling }
        : {}),
    };
    addresses[idx] = updated;

    // If the updated address is now default, unset the flag on the others.
    if (dto.isDefaultShipping) {
      addresses.forEach((a, i) => {
        if (i !== idx) a.isDefaultShipping = false;
      });
    }
    if (dto.isDefaultBilling) {
      addresses.forEach((a, i) => {
        if (i !== idx) a.isDefaultBilling = false;
      });
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { address: addresses as unknown as Prisma.InputJsonValue },
    });

    return updated;
  }

  async removeAddress(
    customerId: string,
    addressId: string,
    currentUser: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const addresses = this.parseAddresses(customer.address);
    const idx = addresses.findIndex((a) => a.id === addressId);
    if (idx === -1) {
      throw new NotFoundException(
        `Address ${addressId} not found on customer ${customerId}`,
      );
    }

    const [removed] = addresses.splice(idx, 1);

    // If the removed address was a default, promote the first remaining
    // address (if any) to take its place.
    if (addresses.length > 0) {
      if (removed.isDefaultShipping) {
        addresses[0].isDefaultShipping = true;
      }
      if (removed.isDefaultBilling) {
        addresses[0].isDefaultBilling = true;
      }
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { address: addresses as unknown as Prisma.InputJsonValue },
    });

    return { success: true };
  }
}
