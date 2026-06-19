import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ select: false })
  password: string;
  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  number: string;

  @Column({ nullable: true })
  shop_name: string;

  @Column({ default: 'user' }) // admin, manager, employee
  role: string;

  @Column({ type: 'simple-json', nullable: true })
  permissions: any;
}
