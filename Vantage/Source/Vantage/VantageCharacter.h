#pragma once

#include "CoreMinimal.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/Character.h"
#include "VantageCharacter.generated.h"

class UCameraComponent;
class UInputAction;
class UInputMappingContext;
class UInteractionProbe;
class USpotLightComponent;
struct FInputActionValue;

/**
 * The player. First person, no visible body, no animation assets.
 *
 * All of its Enhanced Input assets are built in C++ at PostInitializeComponents
 * rather than loaded from .uasset files, which is what lets this project run
 * without any content. See BuildInputBindings().
 */
UCLASS()
class VANTAGE_API AVantageCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AVantageCharacter();

	virtual void BeginPlay() override;
	virtual void PostInitializeComponents() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	UInteractionProbe* GetInteractionProbe() const { return InteractionProbe; }

protected:
	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UCameraComponent> Camera;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<USpotLightComponent> Flashlight;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UInteractionProbe> InteractionProbe;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement")
	float WalkSpeed = 420.f;

	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Movement")
	float SprintSpeed = 780.f;

	/** Multiplier on mouse delta. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look")
	float MouseSensitivity = 1.f;

	/** Degrees per second at full gamepad stick deflection. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Look")
	float GamepadLookRate = 140.f;

	/** Falling past this Z puts the player back at the spawn point. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage|Safety")
	float FallRecoveryZ = -1200.f;

private:
	/** Creates the transient InputAction / InputMappingContext objects. Idempotent. */
	void BuildInputBindings();

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void LookRate(const FInputActionValue& Value);
	void StartSprint();
	void StopSprint();
	void ToggleCrouch();
	void TryInteract();
	void ToggleFlashlight();

	/** Puts the player back on the floor if they end up under the level. */
	void CheckForFall();

	/** Fires once, a few seconds in, if no input has arrived at all. */
	void ReportSilentInput();

	FTimerHandle FallCheckTimer;
	FTimerHandle InputWatchdogTimer;

	/** Set by the first input of any kind. Only used for the watchdog message. */
	bool bReceivedAnyInput = false;

	UPROPERTY(Transient) TObjectPtr<UInputMappingContext> InputContext;
	UPROPERTY(Transient) TObjectPtr<UInputAction> MoveAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookRateAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> JumpAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> SprintAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> CrouchAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> InteractAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> FlashlightAction;
};
