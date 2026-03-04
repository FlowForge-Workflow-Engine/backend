import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";

export function IsNotAdmin(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "IsNotAdmin",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: {
        message: `${propertyName} can not be admin`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return value?.toLowerCase() !== "admin";
        },
      },
    });
  };
}
