import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Meta {
  @PrimaryColumn({ name: 'mkey' })
  key: string;

  @Column({ type: 'text', nullable: true, name: 'mvalue' })
  value: string;
}
