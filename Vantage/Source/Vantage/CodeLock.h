#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CodeLock.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;

/**
 * The four dial combination lock on the vault door upstairs.
 *
 * The lock owns the puzzle state; the player character owns the input and just
 * forwards nudges to it, and the HUD draws whatever GetDigit() reports. Keeping
 * it that way means the lock needs no widget and no input context of its own.
 *
 * The combination is generated per run and stencilled on a plaque downstairs.
 */
UCLASS()
class VANTAGE_API ACodeLock : public AActor
{
	GENERATED_BODY()

public:
	ACodeLock();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Sets the combination this lock wants. Four digits, 0-9. */
	void SetCombination(const TArray<int32>& InCombination);

	/** Player stepped up to it. */
	void Engage();

	/** Player stepped away, or was interrupted. */
	void Disengage();

	/** Tries the entered digits. True if it opened. */
	bool Submit();

	void NudgeDigit(int32 Delta);
	void MoveCursor(int32 Delta);

	bool IsOpen() const { return bOpen; }
	bool IsEngaged() const { return bEngaged; }
	int32 GetCursor() const { return Cursor; }
	int32 GetDigitCount() const { return Entered.Num(); }
	int32 GetDigit(int32 Index) const { return Entered.IsValidIndex(Index) ? Entered[Index] : 0; }

	/** Counts down after a wrong code. Drives the red flash on the HUD. */
	float GetRejectFlash() const { return RejectFlash; }

private:
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<USceneComponent> Pivot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Housing;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Face;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Bolt;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UPointLightComponent> Indicator;

	UPROPERTY(Transient) TObjectPtr<UMaterialInstanceDynamic> FaceMaterial;

	TArray<int32> Combination;
	TArray<int32> Entered;

	int32 Cursor = 0;
	float RejectFlash = 0.f;
	float BoltSlide = 0.f;
	bool bEngaged = false;
	bool bOpen = false;
};
