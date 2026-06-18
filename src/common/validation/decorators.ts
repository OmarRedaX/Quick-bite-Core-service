import { registerDecorator, ValidationArguments, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'IsAtLeastOneRequired', async: false })
export class IsAtLeastOneRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const fields = args.constraints;
    const object = args.object as any;
    return fields.some(field => object[field] !== undefined && object[field] !== null && object[field] !== '');
  }

  defaultMessage(args: ValidationArguments) {
    const fields = args.constraints;
    return `At least one of these fields must be provided: ${fields.join(', ')}`;
  }
}

export function IsAtLeastOneRequired(fields: string[], validationOptions?: ValidationOptions) {
  return function (target: any, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: fields,
      validator: IsAtLeastOneRequiredConstraint,
    });
  };
}