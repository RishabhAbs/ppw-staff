import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Ledger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  person_name: string;

  @Column({ nullable: true })
  phone_number: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  gstin: string;

  @Column({ nullable: true })
  pincode: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  tally_guid: string;
}
